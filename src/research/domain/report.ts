import { z } from "zod";
import {
  ReportIdSchema,
  ReportVersionIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "./ids";
import {
  AcceptedArtifactProvenanceSchema,
  artifactProvenanceErrors,
} from "./reportArtifactProvenance";
import {
  CapabilitySummarySchema,
  ClaimRegisterEntrySchema,
  DataCoverageSchema,
  LimitationSchema,
  LocalizedReportSchema,
  ProviderDisagreementSchema,
  SourceRegisterEntrySchema,
  StructuralMetricSchema,
  VersionDeltaSchema,
} from "./reportComponents";
import { PublicationStatusSchema } from "./reportText";
import { WORKFLOW_V1_DEPARTMENT_IDS } from "./roleRegistry";

const TeamViewSchema = z
  .object({
    departmentId: z.enum(WORKFLOW_V1_DEPARTMENT_IDS),
    position: z
      .object({ en: z.string().min(1), ko: z.string().min(1) })
      .strict(),
    vote: z.enum(["support", "support_with_reservations", "oppose", "abstain"]),
    rationale: z
      .object({ en: z.string().min(1), ko: z.string().min(1) })
      .strict(),
  })
  .strict();

export {
  type AcceptedArtifactProvenance,
  AcceptedArtifactProvenanceSchema,
  MEMO_ARTIFACT_ROLES,
  REQUIRED_REPORT_ARTIFACT_ROLES,
  WORKFLOW_V1_REPORT_LOGICAL_ARTIFACT_IDS,
} from "./reportArtifactProvenance";
export {
  ClaimRegisterEntrySchema,
  DissentSchema,
  ReportSectionSchema,
  ScenarioAssumptionSchema,
  ScenarioSchema,
  SourceRegisterEntrySchema,
  StructuralMetricSchema,
  UnknownSchema,
  VersionDeltaSchema,
} from "./reportComponents";
export {
  type SemanticAudit,
  SemanticAuditSchema,
  type SemanticVerdict,
  SemanticVerdictSchema,
} from "./reportSemantic";
export {
  LocalizedTextSchema,
  PUBLICATION_STATUSES,
  type PublicationStatus,
  PublicationStatusSchema,
  ReportNarrativeTextSchema,
} from "./reportText";

function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort();
}

function citationSignatures(
  values: readonly {
    readonly id: string;
    readonly claimIds: readonly string[];
    readonly sourceIds: readonly string[];
  }[],
): readonly string[] {
  return values
    .map(
      (value) =>
        `${value.id}|${sorted(value.claimIds).join(",")}|${sorted(value.sourceIds).join(",")}`,
    )
    .sort();
}

function dissentSignatures(
  values: readonly {
    readonly id: string;
    readonly claimId: string;
    readonly sourceIds: readonly string[];
    readonly disposition: string;
  }[],
): readonly string[] {
  return values
    .map(
      (value) =>
        `${value.id}|${value.claimId}|${sorted(value.sourceIds).join(",")}|${value.disposition}`,
    )
    .sort();
}

export const ResearchReportSchema = z
  .object({
    schemaVersion: z.literal("workflow-v1"),
    reportId: ReportIdSchema,
    versionId: ReportVersionIdSchema,
    version: z.number().int().positive(),
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    status: PublicationStatusSchema,
    researchDirection: z.string().min(2).max(100).optional(),
    marketSnapshot: z
      .object({
        providerCode: z.string().trim().min(1).max(240),
        lastPrice: z.number().positive(),
        currency: z.string().trim().min(3).max(8),
        observedAt: z.string().datetime(),
        marketState: z.enum(["OPEN", "CLOSED", "PRE", "POST", "HOLIDAYS"]),
      })
      .strict()
      .optional(),
    teamViews: z.array(TeamViewSchema).length(4),
    artifacts: z.array(AcceptedArtifactProvenanceSchema).length(12),
    capabilities: z.array(CapabilitySummarySchema).min(1),
    locales: z
      .object({ en: LocalizedReportSchema, ko: LocalizedReportSchema })
      .strict(),
    versionDelta: VersionDeltaSchema,
    claims: z.array(ClaimRegisterEntrySchema),
    sources: z.array(SourceRegisterEntrySchema),
    dataCoverage: z.array(DataCoverageSchema).min(1),
    providerDisagreements: z.array(ProviderDisagreementSchema),
    metrics: z.array(StructuralMetricSchema).min(1),
    limitations: z.array(LimitationSchema),
  })
  .strict()
  .superRefine((report, context) => {
    for (const key of ["sections", "scenarios"] as const)
      if (
        JSON.stringify(citationSignatures(report.locales.en[key])) !==
        JSON.stringify(citationSignatures(report.locales.ko[key]))
      )
        context.addIssue({
          code: "custom",
          path: ["locales", "ko", key],
          message: `${key} IDs and citation sets/counts must match`,
        });
    if (
      JSON.stringify(dissentSignatures(report.locales.en.dissent)) !==
      JSON.stringify(dissentSignatures(report.locales.ko.dissent))
    )
      context.addIssue({
        code: "custom",
        path: ["locales", "ko", "dissent"],
        message: "dissent IDs and stable references/counts must match",
      });
    if (
      JSON.stringify(
        sorted(report.locales.en.unknowns.map((value) => value.id)),
      ) !==
      JSON.stringify(
        sorted(report.locales.ko.unknowns.map((value) => value.id)),
      )
    )
      context.addIssue({
        code: "custom",
        path: ["locales", "ko", "unknowns"],
        message: "unknown IDs/counts must match",
      });
    for (const message of artifactProvenanceErrors({
      artifacts: report.artifacts,
      runId: report.runId,
      snapshotId: report.snapshotId,
    }))
      context.addIssue({
        code: "custom",
        path: ["artifacts"],
        message,
      });
    if (
      (report.version === 1) !==
      (report.versionDelta.priorVersionId === null)
    )
      context.addIssue({
        code: "custom",
        path: ["versionDelta"],
        message: "prior version lineage is inconsistent",
      });
    const claimIds = new Set(report.claims.map((claim) => claim.claimId));
    const sourceIds = new Set(report.sources.map((source) => source.sourceId));
    const hasPublicationLimitation =
      report.capabilities.some(
        (capability) => capability.availability !== "available",
      ) || report.limitations.length > 0;
    if (report.status === "complete" && hasPublicationLimitation)
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "complete requires no publication limitations",
      });
    if (
      report.status === "complete_with_limitations" &&
      !hasPublicationLimitation
    )
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "complete_with_limitations requires a publication limitation",
      });
    for (const claim of report.claims)
      if (claim.sourceIds.some((sourceId) => !sourceIds.has(sourceId)))
        context.addIssue({
          code: "custom",
          path: ["claims"],
          message: "claim cites an unknown source",
        });
    for (const locale of [report.locales.en, report.locales.ko])
      for (const item of [...locale.sections, ...locale.scenarios]) {
        if (item.claimIds.some((claimId) => !claimIds.has(claimId)))
          context.addIssue({
            code: "custom",
            path: ["locales"],
            message: "localized item cites an unknown claim",
          });
        if (item.sourceIds.some((sourceId) => !sourceIds.has(sourceId)))
          context.addIssue({
            code: "custom",
            path: ["locales"],
            message: "localized item cites an unknown source",
          });
      }
    for (const locale of [report.locales.en, report.locales.ko])
      for (const dissent of locale.dissent) {
        if (!claimIds.has(dissent.claimId))
          context.addIssue({
            code: "custom",
            path: ["locales"],
            message: "dissent cites an unknown claim",
          });
        if (dissent.sourceIds.some((sourceId) => !sourceIds.has(sourceId)))
          context.addIssue({
            code: "custom",
            path: ["locales"],
            message: "dissent cites an unknown source",
          });
      }
  });
export type ResearchReport = z.infer<typeof ResearchReportSchema>;
