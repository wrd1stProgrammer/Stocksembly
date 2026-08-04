import { z } from "zod";
import { ClaimIdSchema } from "../../domain/ids";
import { questionLookupPlan } from "../../domain/questionLookupPlan";
import type {
  ResearchReport,
  WorkflowV2ResearchReport,
} from "../../domain/report";
import {
  type CodexRuntimeOverride,
  QA_ADVANCED_RUNTIME,
} from "../codex/codexPolicy";
import { codexInputHash } from "../codex/codexReservation";
import {
  consultationRequest,
  questionResearchContext,
  SpecialistConsultationSchema,
} from "./questionResearchContext";

export { questionResearchContext } from "./questionResearchContext";

export const QuestionSelectionSchema = z
  .object({
    claimIds: z.array(ClaimIdSchema).max(3).readonly(),
    externalUrls: z
      .array(z.string().trim().min(1).max(8_192))
      .max(3)
      .readonly(),
    answer: z
      .object({
        en: z.string().trim().min(1).max(1_200),
        ko: z.string().trim().min(1).max(1_200),
      })
      .strict(),
  })
  .strict()
  .refine(
    (selection) =>
      new Set(selection.claimIds).size === selection.claimIds.length &&
      new Set(selection.externalUrls).size === selection.externalUrls.length,
    { message: "selected evidence IDs and URLs must be unique" },
  )
  .refine(
    (selection) =>
      selection.claimIds.length + selection.externalUrls.length > 0,
    { message: "at least one evidence item is required" },
  )
  .readonly();
export type QuestionSelection = z.infer<typeof QuestionSelectionSchema>;

export type GroundedQuestionClaim = {
  readonly claimId: z.infer<typeof ClaimIdSchema>;
  readonly sourceIds: readonly string[];
  readonly text: { readonly en: string; readonly ko: string };
};

export function questionRuntimeOverride(question: {
  readonly en: string;
  readonly ko: string;
}): CodexRuntimeOverride | undefined {
  const parsed = SpecialistConsultationSchema.safeParse(
    consultationRequest(question),
  );
  return parsed.success && parsed.data.advancedReasoning === true
    ? QA_ADVANCED_RUNTIME
    : undefined;
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

export function groundedClaims(
  report: ResearchReport | WorkflowV2ResearchReport,
): readonly GroundedQuestionClaim[] {
  return report.claims.flatMap((claim) => {
    const text = claimText(report, claim.claimId);
    return text === undefined
      ? []
      : [{ claimId: claim.claimId, sourceIds: claim.sourceIds, text }];
  });
}

export function questionPrompt(
  report: ResearchReport | WorkflowV2ResearchReport,
  questionId: string,
  question: { readonly en: string; readonly ko: string },
): string {
  const request = consultationRequest(question);
  const researchContext = questionResearchContext(report, question);
  return JSON.stringify({
    kind: "grounded_report_question_v1",
    rule: "First follow lookupPlan exactly. For report_only, do not use web tools and answer only from the smallest sufficient published claim set with externalUrls empty. For external, use supplied externalApiEvidence when relevant and use hosted web search only for current facts or gaps the published report and API evidence cannot answer; return the exact canonical URL of every web source you rely on in externalUrls. Never pad either evidence list. Write a direct 2 to 4 sentence answer in Korean and English using every selected claim and external source explicitly, but do not print raw URLs or Markdown links in the answer because the product renders citations separately. Apply the selected specialist lens and do not add unsupported facts.",
    questionId,
    reportId: report.reportId,
    reportVersionId: report.versionId,
    request,
    lookupPlan: questionLookupPlan(question),
    claims: researchContext.claims,
    sources: researchContext.sources,
  });
}

export function questionInputHash(
  report: ResearchReport | WorkflowV2ResearchReport,
  questionId: string,
  question: { readonly en: string; readonly ko: string },
): string {
  return codexInputHash({
    stage: "qa",
    prompt: questionPrompt(report, questionId, question),
    outputSchema: QuestionSelectionSchema,
  });
}
