import type {
  ResearchReport,
  WorkflowV2ResearchReport,
} from "../domain/report";
import type { z } from "zod";
import type { AtomicEditorialClaimSchema } from "../domain/agentOutputs";
import type { PrePublicationEditorialEnvelope } from "../workflow/prePublicationEditorialGate";
import type { ResearchProfile } from "../domain/researchProfile";

export type AssemblyInput = {
  readonly locale?: "en" | "ko";
  readonly reportId: string;
  readonly versionId: string;
  readonly version: number;
  readonly priorReport?: ResearchReport | WorkflowV2ResearchReport;
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
  readonly comparators?: WorkflowV2ResearchReport["comparators"];
  readonly editorialClaims?: readonly z.infer<
    typeof AtomicEditorialClaimSchema
  >[];
  readonly researchProfile?: ResearchProfile;
};

export type AssembleReportResult =
  | {
      readonly kind: "assembled";
      readonly report: WorkflowV2ResearchReport;
      readonly editorialPublication: PrePublicationEditorialEnvelope;
    }
  | { readonly kind: "blocked"; readonly reason: string };
