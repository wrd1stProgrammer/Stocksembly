import { ChairSynthesisOutputSchema } from "../domain/agentOutputs";
import {
  CHAIR_SECTION_KEYS,
  ChairSynthesisModelOutputSchema,
  ChairSynthesisPromptSchema,
} from "./chairSynthesisContracts";

type ChairSectionKey = (typeof CHAIR_SECTION_KEYS)[number];
type ChairPrompt = ReturnType<typeof ChairSynthesisPromptSchema.parse>;
type ChairSentence = ChairPrompt["sentences"][number];

function allowedSentenceKinds(
  sectionKey: ChairSectionKey,
): readonly ChairSentence["kind"][] {
  if (sectionKey === "ten_second_brief")
    return ["claim", "position", "ballot", "dissent", "unknown"];
  if (sectionKey === "supported_analysis")
    return ["claim", "position", "ballot", "dissent", "unknown"];
  if (sectionKey === "valuation_comparison")
    return ["claim", "position", "ballot", "dissent", "unknown"];
  if (sectionKey === "operational_scenarios")
    return [
      "scenario",
      "claim",
      "position",
      "change_condition",
      "dissent",
      "unknown",
    ];
  if (sectionKey === "dissent_unknowns")
    return ["dissent", "unknown", "ballot"];
  return ["change_condition", "claim", "unknown", "dissent"];
}

function summaryIsValid(
  sectionKey: ChairSectionKey,
  summary: string,
  sentences: readonly ChairSentence[],
  locale: "en" | "ko",
  question: string | undefined,
): boolean {
  const maxLength = sectionKey === "ten_second_brief" ? 360 : 4_000;
  const sourceText = sentences
    .map((sentence) => sentence.text[locale])
    .join(" ");
  const numericTokens =
    summary.match(/[$€£]?[+-]?\d[\d,.]*(?:%|[A-Za-z])?/gu) ?? [];
  const sourceTokens = new Set(
    sourceText.toLocaleLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu) ?? [],
  );
  const summaryTokens =
    summary.toLocaleLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu) ?? [];
  const normalizedQuestion = question?.replace(/\s+/gu, " ").trim();
  return (
    summary.length > 0 &&
    summary.length <= maxLength &&
    summaryTokens.some((token) => sourceTokens.has(token)) &&
    numericTokens.every((token) => sourceText.includes(token)) &&
    !/\b(?:buy|sell)\s+now\b/iu.test(summary) &&
    !/(?:지금|즉시)\s*(?:매수|매도)/u.test(summary) &&
    !/(?:claim|question).{0,32}(?:missing|not supplied|not provided)/iu.test(
      summary,
    ) &&
    !/(?:주장|질문).{0,24}(?:없|제공되지|누락)/u.test(summary) &&
    (sectionKey === "ten_second_brief" ||
      normalizedQuestion === undefined ||
      normalizedQuestion.length < 12 ||
      !summary.includes(normalizedQuestion))
  );
}

function boundedText(
  sentences: readonly ChairSentence[],
  locale: "en" | "ko",
  maxLength: number,
): string {
  let value = "";
  for (const sentence of sentences) {
    const next = `${value}${value.length === 0 ? "" : " "}${sentence.text[locale]}`;
    if (next.length > maxLength) break;
    value = next;
  }
  return value.length > 0
    ? value
    : (sentences[0]?.text[locale].slice(0, maxLength).trim() ?? "");
}

function fallbackSummary(
  sectionKey: ChairSectionKey,
  sentences: readonly ChairSentence[],
  locale: "en" | "ko",
): { readonly en: string; readonly ko: string } {
  const maxLength = sectionKey === "ten_second_brief" ? 360 : 4_000;
  const value = boundedText(sentences, locale, maxLength);
  return {
    en: value,
    ko: value,
  };
}

function resolveChairCandidate(
  promptJson: string,
  raw: unknown,
  repairInvalidSections: boolean,
): unknown {
  const prompt = ChairSynthesisPromptSchema.parse(JSON.parse(promptJson));
  const rawRecord =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : undefined;
  const rawSections =
    rawRecord !== undefined && Array.isArray(rawRecord["sections"])
      ? rawRecord["sections"]
      : undefined;
  const normalizedRaw =
    rawRecord !== undefined &&
    rawRecord["sourceArtifactIds"] !== undefined &&
    rawSections !== undefined
      ? {
          ...rawRecord,
          sections: rawSections.map((section) => {
            if (typeof section !== "object" || section === null) return section;
            const record = section as Record<string, unknown>;
            const summary = record["publicSummary"];
            if (typeof summary !== "object" || summary === null) return section;
            return {
              ...record,
              publicSummary: (summary as Record<string, unknown>)[
                prompt.mandate.locale
              ],
            };
          }),
        }
      : raw;
  const normalizedRecord =
    typeof normalizedRaw === "object" && normalizedRaw !== null
      ? (normalizedRaw as Record<string, unknown>)
      : undefined;
  const normalizedSections =
    normalizedRecord !== undefined &&
    Array.isArray(normalizedRecord["sections"])
      ? normalizedRecord["sections"]
      : undefined;
  const repairableRaw =
    repairInvalidSections &&
    normalizedSections !== undefined &&
    normalizedSections.length > 0 &&
    normalizedSections.length < CHAIR_SECTION_KEYS.length
      ? {
          ...normalizedRecord,
          sections: [
            ...normalizedSections,
            ...Array.from(
              { length: CHAIR_SECTION_KEYS.length - normalizedSections.length },
              () => normalizedSections[0],
            ),
          ],
        }
      : normalizedRaw;
  const candidate = ChairSynthesisModelOutputSchema.safeParse(repairableRaw);
  if (!candidate.success) return {};
  const catalog = new Map(
    prompt.sentences.map((sentence) => [sentence.sentenceId, sentence]),
  );
  const candidateByKey = new Map(
    candidate.data.sections.map((section) => [section.sectionKey, section]),
  );
  const sections = CHAIR_SECTION_KEYS.map((sectionKey) => {
    const draft = candidateByKey.get(sectionKey);
    const allowedKinds = allowedSentenceKinds(sectionKey);
    const requestedIds = draft?.sentenceIds ?? [];
    const selected = requestedIds.flatMap((id) => {
      const sentence = catalog.get(id);
      return sentence !== undefined && allowedKinds.includes(sentence.kind)
        ? [sentence]
        : [];
    });
    const uniqueSelected = [
      ...new Map(
        selected.map((sentence) => [sentence.sentenceId, sentence]),
      ).values(),
    ];
    const draftIsValid =
      draft !== undefined &&
      selected.length > 0 &&
      selected.length === requestedIds.length &&
      new Set(requestedIds).size === requestedIds.length &&
      summaryIsValid(
        sectionKey,
        draft.publicSummary,
        uniqueSelected,
        prompt.mandate.locale,
        prompt.mandate.question,
      );
    if (!draftIsValid && !repairInvalidSections) return undefined;
    const resolvedSentences =
      uniqueSelected.length > 0
        ? uniqueSelected
        : prompt.sentences
            .filter((sentence) => allowedKinds.includes(sentence.kind))
            .slice(0, sectionKey === "ten_second_brief" ? 1 : 8);
    if (resolvedSentences.length === 0) return undefined;
    return {
      sectionId: sectionKey,
      sectionKey,
      publicSummary: draftIsValid
        ? {
            en: draft.publicSummary,
            ko: draft.publicSummary,
          }
        : fallbackSummary(sectionKey, resolvedSentences, prompt.mandate.locale),
      sentenceIds: resolvedSentences.map((sentence) => sentence.sentenceId),
      sourceArtifactIds: [
        ...new Set(
          resolvedSentences.flatMap((sentence) => sentence.sourceArtifactIds),
        ),
      ],
      auditedClaimIds: [
        ...new Set(resolvedSentences.flatMap((sentence) => sentence.claimIds)),
      ],
    };
  });
  if (sections.some((section) => section === undefined)) return {};
  return ChairSynthesisOutputSchema.parse({
    kind: "chair_synthesis",
    sourceArtifactIds: prompt.sourceArtifactIds,
    sections,
    ballotArtifactIds: prompt.ballots.map((ballot) => ballot.artifactId),
    dissentClaimIds: prompt.dissentClaimIds,
    unknowns: prompt.sentences
      .filter((sentence) => sentence.kind === "unknown")
      .map((sentence) => sentence.text),
  });
}

export function validChairCandidate(promptJson: string, raw: unknown): unknown {
  return resolveChairCandidate(promptJson, raw, false);
}

export function repairChairCandidate(
  promptJson: string,
  raw: unknown,
): unknown {
  return resolveChairCandidate(promptJson, raw, true);
}
