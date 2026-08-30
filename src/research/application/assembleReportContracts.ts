import type { z } from "zod";
import type { AtomicEditorialClaimSchema } from "../domain/agentOutputs";
import type {
  ResearchReport,
  WorkflowV2ResearchReport,
  WorkflowV3ResearchReport,
} from "../domain/report";
import type { ResearchProfile } from "../domain/researchProfile";
import type { PrePublicationEditorialEnvelope } from "../workflow/prePublicationEditorialGate";
import type {
  RecoverablePublicClaim,
  RecoverablePublicScenario,
} from "./publicationRecovery";

export type AssemblyInput = {
  readonly locale?: "en" | "ko";
  readonly reportId: string;
  readonly versionId: string;
  readonly version: number;
  readonly priorReport?:
    | ResearchReport
    | WorkflowV2ResearchReport
    | WorkflowV3ResearchReport;
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
  /** Optional workflow-v3 publication metadata. Legacy workflows are adapted
   * to factual claims at the publication recovery boundary. */
  readonly publicationClaims?: readonly RecoverablePublicClaim[];
  readonly repairPublicClaim?: (
    claim: RecoverablePublicClaim,
  ) => RecoverablePublicClaim | undefined;
  readonly repairPublicScenario?: (
    scenario: RecoverablePublicScenario,
  ) => RecoverablePublicScenario | undefined;
};

export type AssembleReportResult =
  | {
      readonly kind: "assembled";
      readonly report: WorkflowV2ResearchReport;
      readonly editorialPublication: PrePublicationEditorialEnvelope;
      readonly recoveryMetadata: {
        readonly comparatorNormalizationAttemptCount?: number;
        readonly omissions: readonly (
          | import("./publicationRecovery").PublicationRecoveryOmission
          | { readonly itemId: string; readonly reason: string }
        )[];
        readonly repairAttempts: import("./publicationRecovery").PublicPublicationRecovery["repairAttempts"];
        readonly scenarioRepairAttempts: import("./publicationRecovery").PublicPublicationRecovery["scenarioRepairAttempts"];
      };
    }
  | { readonly kind: "blocked"; readonly reason: string };
