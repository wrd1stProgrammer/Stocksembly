import type { ResearchReport } from "../domain/report";

export type AssemblyInput = {
  readonly locale?: "en" | "ko";
  readonly reportId: string;
  readonly versionId: string;
  readonly version: number;
  readonly priorReport?: ResearchReport;
  readonly researchDirection?: string | undefined;
  readonly teamViews: ResearchReport["teamViews"];
  readonly artifacts: readonly unknown[];
  readonly authenticatedSources: readonly unknown[];
  readonly structuralAudit: unknown;
  readonly semanticAudit: unknown;
  readonly chair: unknown;
  readonly chairScenarioIds: readonly string[];
  readonly chairSentences: readonly {
    readonly sentenceId: string;
    readonly kind: string;
    readonly claimIds: readonly string[];
    readonly sourceArtifactIds: readonly string[];
    readonly text: { readonly en: string; readonly ko: string };
  }[];
};

export type AssembleReportResult =
  | { readonly kind: "assembled"; readonly report: ResearchReport }
  | { readonly kind: "blocked"; readonly reason: string };
