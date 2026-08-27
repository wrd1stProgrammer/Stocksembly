import type { z } from "zod";
import type { ChairSynthesisOutputSchema } from "../domain/agentOutputs";
import { normalizeReportNarrativeText } from "../domain/reportText";

export const SECTION_TITLES = {
  ten_second_brief: { en: "Ten-second brief", ko: "10초 요약" },
  supported_analysis: { en: "Supported analysis", ko: "근거 기반 분석" },
  valuation_comparison: {
    en: "Valuation and comparison",
    ko: "밸류에이션과 기업 비교",
  },
  operational_scenarios: { en: "Operational scenarios", ko: "운영 시나리오" },
  dissent_unknowns: { en: "Dissent and unknowns", ko: "이견과 미확인 사항" },
  change_conditions: { en: "Change conditions", ko: "변경 조건" },
} as const;

export function scenarioMetric(field: string) {
  switch (field) {
    case "revenue":
      return { metric: field, unit: "USD" } as const;
    case "operating_margin":
      return { metric: field, unit: "percent" } as const;
    case "diluted_eps":
      return { metric: field, unit: "USD_per_share" } as const;
    default:
      return undefined;
  }
}

export function sameSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    left.every((value) => right.includes(value))
  );
}

function sharesGroundingLanguage(summary: string, sources: readonly string[]) {
  const sourceTokens = new Set(
    sources
      .join(" ")
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}_-]{3,}/gu) ?? [],
  );
  const summaryTokens =
    summary.toLocaleLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu) ?? [];
  return summaryTokens.some((token) => sourceTokens.has(token));
}

type ChairValidationInput = {
  readonly chair: z.infer<typeof ChairSynthesisOutputSchema>;
  readonly locale: "en" | "ko" | undefined;
  readonly sentences: readonly {
    readonly sentenceId: string;
    readonly claimIds: readonly string[];
    readonly sourceArtifactIds: readonly string[];
    readonly text: { readonly en: string; readonly ko: string };
  }[];
  readonly auditedClaimIds: ReadonlySet<string>;
  readonly retainedDissentClaimIds: readonly string[];
  readonly retainedOpenQuestionCount: number;
};

function validLocalizedSummary(
  summary: Readonly<{ en: string; ko: string }>,
  selected: ChairValidationInput["sentences"],
  locale: ChairValidationInput["locale"],
  maxLength: number,
): boolean {
  const mirrored = summary.en.trim() === summary.ko.trim();
  if (mirrored) {
    if (locale === undefined) return false;
    return (
      summary[locale].trim().length > 0 &&
      summary[locale].length <= maxLength &&
      sharesGroundingLanguage(
        summary[locale],
        selected.map((sentence) => sentence.text[locale]),
      )
    );
  }
  const locales: readonly ("en" | "ko")[] = ["en", "ko"];
  return locales.every(
    (current) =>
      summary[current].trim().length > 0 &&
      summary[current].length <= maxLength &&
      sharesGroundingLanguage(
        summary[current],
        selected.map((sentence) => sentence.text[current]),
      ),
  );
}

export function chairValidationReason(
  input: ChairValidationInput,
): string | undefined {
  const sectionKeys = input.chair.sections.map((section) => section.sectionKey);
  if (!sameSet(sectionKeys, Object.keys(SECTION_TITLES)))
    return "chair_sections_incomplete";
  // The structural audit is the authoritative retention ledger. Chair output can
  // omit or reorder retention metadata even when every published sentence is
  // correctly grounded. Publication assembly projects dissent and open questions
  // from the audited ledger below, so a second model-authored count comparison
  // must not discard an otherwise complete report.
  if (
    input.chair.sections.some((section) =>
      section.auditedClaimIds.some(
        (claimId) => !input.auditedClaimIds.has(claimId),
      ),
    )
  )
    return "chair_claim_invented";
  const sentences = new Map(
    input.sentences.map((sentence) => [sentence.sentenceId, sentence]),
  );
  if (sentences.size !== input.sentences.length)
    return "chair_content_mismatch";
  for (const section of input.chair.sections) {
    const selected = section.sentenceIds.flatMap((id) => {
      const sentence = sentences.get(id);
      return sentence === undefined ? [] : [sentence];
    });
    if (
      selected.length !== section.sentenceIds.length ||
      !validLocalizedSummary(
        section.publicSummary,
        selected,
        input.locale,
        section.sectionKey === "ten_second_brief" ? 360 : 4_000,
      ) ||
      !sameSet(
        [...new Set(selected.flatMap((sentence) => sentence.claimIds))],
        section.auditedClaimIds,
      ) ||
      !sameSet(
        [
          ...new Set(
            selected.flatMap((sentence) => sentence.sourceArtifactIds),
          ),
        ],
        section.sourceArtifactIds,
      )
    ) {
      return "chair_content_mismatch";
    }
  }
  return undefined;
}

type LocalizedProjectionInput = {
  readonly sections: readonly {
    readonly id: string;
    readonly title: { readonly en: string; readonly ko: string };
    readonly body: { readonly en: string; readonly ko: string };
    readonly claimIds: readonly string[];
    readonly sourceIds: readonly string[];
  }[];
  readonly scenarios: readonly {
    readonly id: string;
    readonly name: { readonly en: string; readonly ko: string };
    readonly assumptions: readonly {
      readonly metric: "revenue" | "operating_margin" | "diluted_eps";
      readonly value: string;
      readonly unit: "USD" | "USD_per_share" | "percent";
    }[];
    readonly claimIds: readonly string[];
    readonly sourceIds: readonly string[];
  }[];
  readonly dissent: readonly {
    readonly claimId: string;
    readonly sourceIds: readonly string[];
    readonly text: { readonly en: string; readonly ko: string };
  }[];
  readonly questions: readonly {
    readonly questionId: string;
    readonly text: { readonly en: string; readonly ko: string };
  }[];
  readonly evidenceByClaim: ReadonlyMap<string, readonly string[]>;
};

export function localizedReport(input: LocalizedProjectionInput) {
  const project = (locale: "en" | "ko") => ({
    sections: input.sections.map((section) => ({
      ...section,
      title: section.title[locale],
      body: normalizeReportNarrativeText(
        section.body[locale],
        locale === "en"
          ? "The authenticated evidence supports this section with limitations."
          : "인증된 근거는 한계와 함께 이 분석을 뒷받침합니다.",
      ),
    })),
    scenarios: input.scenarios.map((scenario) => ({
      ...scenario,
      name: normalizeReportNarrativeText(
        scenario.name[locale],
        locale === "en" ? "Evidence-based scenario" : "근거 기반 시나리오",
      ),
    })),
    dissent: input.dissent.map((dissent) => ({
      id: `dissent:${dissent.claimId}`,
      claimId: dissent.claimId,
      sourceIds: dissent.sourceIds,
      disposition: "unresolved" as const,
      text: normalizeReportNarrativeText(
        dissent.text[locale],
        locale === "en"
          ? "The authenticated evidence does not yet resolve this dissent."
          : "인증된 근거만으로는 이 이견을 아직 해소할 수 없습니다.",
      ),
    })),
    unknowns: input.questions.map((question) => ({
      id: question.questionId,
      impact: normalizeReportNarrativeText(
        question.text[locale],
        locale === "en"
          ? "This unresolved evidence gap may change the research conclusion."
          : "이 미확인 근거는 리서치 결론을 바꿀 수 있습니다.",
      ),
      nextEvidence:
        locale === "en"
          ? "Resolve this with the next authenticated filing or licensed-provider update."
          : "다음 인증 공시 또는 라이선스 공급자 업데이트로 확인합니다.",
    })),
  });
  return { en: project("en"), ko: project("ko") };
}
