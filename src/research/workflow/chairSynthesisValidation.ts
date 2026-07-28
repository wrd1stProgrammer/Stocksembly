import { ChairSynthesisOutputSchema } from "../domain/agentOutputs";
import {
  CHAIR_SECTION_KEYS,
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
  summary: { readonly en: string; readonly ko: string },
): boolean {
  const maxLength = sectionKey === "ten_second_brief" ? 360 : 4_000;
  return (
    summary.en.length <= maxLength &&
    summary.ko.length <= maxLength &&
    !/(?:claim|question).{0,32}(?:missing|not supplied|not provided)/iu.test(
      `${summary.en} ${summary.ko}`,
    ) &&
    !/(?:주장|질문).{0,24}(?:없|제공되지|누락)/u.test(summary.ko)
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
): { readonly en: string; readonly ko: string } {
  const maxLength = sectionKey === "ten_second_brief" ? 360 : 4_000;
  return {
    en: boundedText(sentences, "en", maxLength),
    ko: boundedText(sentences, "ko", maxLength),
  };
}

function resolveChairCandidate(
  promptJson: string,
  raw: unknown,
  repairInvalidSections: boolean,
): unknown {
  const prompt = ChairSynthesisPromptSchema.parse(JSON.parse(promptJson));
  const candidate = ChairSynthesisOutputSchema.safeParse(raw);
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
      summaryIsValid(sectionKey, draft.publicSummary);
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
        ? draft.publicSummary
        : fallbackSummary(sectionKey, resolvedSentences),
      sentenceIds: resolvedSentences.map((sentence) => sentence.sentenceId),
      sourceArtifactIds: [
        ...new Set(
          resolvedSentences.flatMap((sentence) => sentence.sourceArtifactIds),
        ),
      ],
      auditedClaimIds: [
        ...new Set(
          resolvedSentences.flatMap((sentence) => sentence.claimIds),
        ),
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

export function validChairCandidate(
  promptJson: string,
  raw: unknown,
): unknown {
  return resolveChairCandidate(promptJson, raw, false);
}

export function repairChairCandidate(
  promptJson: string,
  raw: unknown,
): unknown {
  return resolveChairCandidate(promptJson, raw, true);
}
