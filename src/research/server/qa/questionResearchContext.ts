import { z } from "zod";
import { ClaimIdSchema, SourceIdSchema } from "../../domain/ids";
import type {
  ResearchReport,
  WorkflowV2ResearchReport,
} from "../../domain/report";

const ConversationEntrySchema = z.looseObject({
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  claimIds: z.array(ClaimIdSchema).max(3).optional(),
  sourceIds: z.array(SourceIdSchema).max(12).optional(),
  externalUrls: z.array(z.string().url()).max(3).optional(),
});

export const SpecialistConsultationSchema = z.looseObject({
  kind: z.literal("specialist_consultation_v1"),
  evidenceScope: z.enum(["intent_routed", "published_report_only"]),
  responseStyle: z.enum(["plain_language", "professional"]),
  advancedReasoning: z.boolean().optional(),
  specialist: z.strictObject({
    name: z.strictObject({ en: z.string(), ko: z.string() }),
    role: z.strictObject({ en: z.string(), ko: z.string() }),
    specialty: z.strictObject({ en: z.string(), ko: z.string() }),
  }),
  userQuestion: z.strictObject({ en: z.string(), ko: z.string() }),
  conversation: z.array(ConversationEntrySchema).max(8).optional(),
  memory: z
    .strictObject({
      referencedClaimIds: z.array(ClaimIdSchema).max(8),
      priorTopics: z.array(z.string().max(120)).max(3),
    })
    .optional(),
  locale: z.enum(["en", "ko"]).optional(),
  externalApiEvidence: z
    .array(
      z.strictObject({
        url: z.url(),
        title: z.string(),
        publisher: z.string(),
        retrievedAt: z.iso.datetime(),
        excerpt: z.string(),
      }),
    )
    .max(3)
    .optional(),
});

export type QuestionResearchContext = {
  readonly claims: readonly {
    readonly claimId: z.infer<typeof ClaimIdSchema>;
    readonly sourceIds: readonly z.infer<typeof SourceIdSchema>[];
    readonly locale: "en" | "ko";
    readonly text: string;
  }[];
  readonly sources: readonly {
    readonly sourceId: z.infer<typeof SourceIdSchema>;
    readonly title: string;
    readonly publisher: string;
    readonly observedAt: string;
    readonly excerpt?: string;
  }[];
};

export function consultationRequest(question: {
  readonly en: string;
  readonly ko: string;
}): unknown {
  for (const value of [question.ko, question.en]) {
    try {
      const parsed = SpecialistConsultationSchema.safeParse(JSON.parse(value));
      if (parsed.success) return parsed.data;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  return question;
}

function claimText(
  report: ResearchReport | WorkflowV2ResearchReport,
  claimId: string,
): { readonly en: string; readonly ko: string } | undefined {
  const registered = report.claims.find(
    (claim) => claim.claimId === claimId,
  )?.text;
  if (registered !== undefined) return registered;
  const en = report.locales.en.sections.find((section) =>
    section.claimIds.includes(ClaimIdSchema.parse(claimId)),
  )?.body;
  const ko = report.locales.ko.sections.find((section) =>
    section.claimIds.includes(ClaimIdSchema.parse(claimId)),
  )?.body;
  return en === undefined || ko === undefined ? undefined : { en, ko };
}

const SEARCH_TOKEN = /[\p{L}\p{N}]+/gu;
const IGNORED_TOKENS = new Set([
  "about",
  "could",
  "explain",
  "please",
  "that",
  "the",
  "this",
  "what",
  "그",
  "근거",
  "대해",
  "더",
  "설명",
  "설명해줘",
  "알려줘",
  "어떻게",
  "이",
  "해줘",
]);
const MAX_SELECTED_CLAIMS = 8;
const MIN_SELECTED_CLAIMS = 4;
const MAX_SOURCE_CAPSULES = 8;
const MAX_EXCERPT_LENGTH = 360;

function tokens(value: string): readonly string[] {
  return (value.toLocaleLowerCase().match(SEARCH_TOKEN) ?? []).filter(
    (token) => token.length > 1 && !IGNORED_TOKENS.has(token),
  );
}

function overlapScore(
  queryTokens: readonly string[],
  candidate: string,
): number {
  const candidateTokens = tokens(candidate);
  return queryTokens.reduce(
    (score, queryToken) =>
      score +
      (candidateTokens.some(
        (candidateToken) =>
          candidateToken.includes(queryToken) ||
          queryToken.includes(candidateToken),
      )
        ? Math.min(queryToken.length, 6)
        : 0),
    0,
  );
}

function selectedClaimIds(
  report: ResearchReport | WorkflowV2ResearchReport,
  request: z.infer<typeof SpecialistConsultationSchema> | undefined,
  locale: "en" | "ko",
): readonly string[] {
  const questionText =
    request?.userQuestion[locale] ??
    request?.userQuestion[locale === "ko" ? "en" : "ko"] ??
    "";
  const queryTokens = tokens(questionText);
  const linkedIds = new Set([
    ...(request?.conversation?.flatMap((entry) => entry.claimIds ?? []) ?? []),
    ...(request?.memory?.referencedClaimIds ?? []),
  ]);
  const scored = report.claims
    .map((claim, index) => {
      const text = claimText(report, claim.claimId)?.[locale] ?? "";
      const match = overlapScore(queryTokens, text);
      return {
        claimId: claim.claimId,
        index,
        score:
          (linkedIds.has(claim.claimId) ? 1_000 : 0) +
          match +
          (match > 0 && claim.materiality === "material" ? 1 : 0),
      };
    })
    .sort(
      (left, right) => right.score - left.score || left.index - right.index,
    );
  const relevant = scored.filter((item) => item.score > 0);
  const candidates =
    relevant.length >= MIN_SELECTED_CLAIMS
      ? relevant
      : [
          ...relevant,
          ...scored.filter(
            (item) =>
              !relevant.some(
                (relevantItem) => relevantItem.claimId === item.claimId,
              ),
          ),
        ];
  return candidates
    .slice(
      0,
      Math.min(
        MAX_SELECTED_CLAIMS,
        Math.max(MIN_SELECTED_CLAIMS, relevant.length),
      ),
    )
    .map((item) => item.claimId);
}

export function questionResearchContext(
  report: ResearchReport | WorkflowV2ResearchReport,
  question: { readonly en: string; readonly ko: string },
): QuestionResearchContext {
  const unknownRequest = consultationRequest(question);
  const parsed = SpecialistConsultationSchema.safeParse(unknownRequest);
  const request = parsed.success ? parsed.data : undefined;
  const locale = request?.locale ?? "ko";
  const claimIds = selectedClaimIds(report, request, locale);
  const claims = claimIds.flatMap((claimId) => {
    const claim = report.claims.find((item) => item.claimId === claimId);
    const text = claimText(report, claimId)?.[locale];
    return claim === undefined || text === undefined
      ? []
      : [{ claimId: claim.claimId, sourceIds: claim.sourceIds, locale, text }];
  });
  const sourceIds = new Set(claims.flatMap((claim) => claim.sourceIds));
  const sources = report.sources
    .filter((source) => sourceIds.has(source.sourceId))
    .slice(0, MAX_SOURCE_CAPSULES)
    .map((source) => ({
      sourceId: source.sourceId,
      title: source.title,
      publisher: source.publisher,
      observedAt:
        source.observedOrFiledAt ??
        source.observedPeriod?.to ??
        source.retrievedAt,
      ...(source.excerpt === undefined
        ? {}
        : { excerpt: source.excerpt.slice(0, MAX_EXCERPT_LENGTH) }),
    }));
  return { claims, sources };
}
