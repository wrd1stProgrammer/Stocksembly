import { z } from "zod";
import {
  ReportIdSchema,
  ReportVersionIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "./ids";
import { ResearchMetricSnapshotSchema } from "./metricSnapshot";
import {
  AcceptedArtifactProvenanceSchema,
  artifactProvenanceErrors,
  DepartmentReportArtifactProvenanceSchema,
} from "./reportArtifactProvenance";
import {
  AtomicEditorialClaimSchema,
  CapabilitySummarySchema,
  ClaimRegisterEntrySchema,
  ComparatorSchema,
  DataCoverageSchema,
  LimitationSchema,
  LocalizedReportSchema,
  PersistedQuestionAnswerSchema,
  ProviderDisagreementSchema,
  SourceRegisterEntrySchema,
  StructuralMetricSchema,
  TeamEditorialDecisionSchema,
  VersionDeltaSchema,
} from "./reportComponents";
import { PublicationStatusSchema } from "./reportText";
import {
  COMMITTEE_RESEARCH_TARGET,
  ResearchTargetSchema,
} from "./researchTarget";
import {
  WORKFLOW_V1_DEPARTMENT_IDS,
  WORKFLOW_V1_ROLE_REGISTRY,
} from "./roleRegistry";

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

const VersionedResearchReportContractSchema = z
  .object({
    schemaVersion: z.enum(["workflow-v1", "workflow-v2"]),
    reportId: ReportIdSchema,
    versionId: ReportVersionIdSchema,
    version: z.number().int().positive(),
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    status: PublicationStatusSchema,
    researchTarget: ResearchTargetSchema.default(COMMITTEE_RESEARCH_TARGET),
    researchDirection: z.string().min(2).max(100).optional(),
    marketSnapshot: z
      .object({
        providerCode: z.string().trim().min(1).max(240),
        lastPrice: z.number().positive(),
        change: z.number().finite().optional(),
        changePercent: z.number().finite().optional(),
        currency: z.string().trim().min(3).max(8),
        observedAt: z.string().datetime(),
        marketState: z.enum(["OPEN", "CLOSED", "PRE", "POST", "HOLIDAYS"]),
      })
      .strict()
      .optional(),
    metricSnapshot: ResearchMetricSnapshotSchema.optional(),
    teamViews: z.array(TeamViewSchema).min(1).max(4),
    artifacts: z.array(
      z.union([
        AcceptedArtifactProvenanceSchema,
        DepartmentReportArtifactProvenanceSchema,
      ]),
    ),
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
    editorialClaims: z.array(AtomicEditorialClaimSchema).max(64).optional(),
    editorialDecision: TeamEditorialDecisionSchema.optional(),
    comparators: z.array(ComparatorSchema).max(64).optional(),
    anticipatedQuestions: z.array(PersistedQuestionAnswerSchema).max(32).optional(),
  })
  .strict()
  .superRefine((report, context) => {
    if (
      report.schemaVersion === "workflow-v1" &&
      [
        report.editorialClaims,
        report.editorialDecision,
        report.comparators,
        report.anticipatedQuestions,
      ].some((value) => value !== undefined)
    )
      context.addIssue({
        code: "custom",
        path: ["schemaVersion"],
        message: "workflow-v1 cannot contain workflow-v2 editorial fields",
      });
    if (report.schemaVersion === "workflow-v2") {
      for (const field of [
        "editorialClaims",
        "editorialDecision",
        "comparators",
        "anticipatedQuestions",
      ] as const)
        if (report[field] === undefined)
          context.addIssue({
            code: "custom",
            path: [field],
            message: `workflow-v2 requires ${field}`,
          });
      const editorialClaimIds = new Set(
        report.editorialClaims?.map((claim) => claim.claimId) ?? [],
      );
      const registeredClaimIds = new Set(report.claims.map((claim) => claim.claimId));
      if (editorialClaimIds.size !== (report.editorialClaims?.length ?? 0))
        context.addIssue({
          code: "custom",
          path: ["editorialClaims"],
          message: "duplicate editorial claim ownership",
        });
      const artifactIds = new Set([
        ...report.artifacts.map((artifact) => artifact.artifactId),
        ...report.sources.map((source) => source.sourceId),
      ]);
      for (const claim of report.editorialClaims ?? [])
        if (!registeredClaimIds.has(claim.claimId))
          context.addIssue({
            code: "custom",
            path: ["editorialClaims"],
            message: "editorial claim is absent from the provenance register",
          });
        else if (
          [...claim.evidenceArtifactIds, ...claim.counterevidenceArtifactIds].some(
            (artifactId) => !artifactIds.has(artifactId),
          )
        )
          context.addIssue({
            code: "custom",
            path: ["editorialClaims"],
            message: "editorial claim cites an unknown evidence artifact",
          });
      for (const claimId of report.editorialDecision?.primaryClaimIds ?? [])
        if (!editorialClaimIds.has(claimId))
          context.addIssue({
            code: "custom",
            path: ["editorialDecision", "primaryClaimIds"],
            message: "editorial decision cites an unknown claim",
          });
      for (const question of report.anticipatedQuestions ?? []) {
        for (const claimId of question.primaryClaimIds)
          if (!editorialClaimIds.has(claimId))
            context.addIssue({
              code: "custom",
              path: ["anticipatedQuestions"],
              message: "anticipated Q&A cites an unknown claim",
            });
        if (question.evidenceArtifactIds.some((artifactId) => !artifactIds.has(artifactId)))
          context.addIssue({
            code: "custom",
            path: ["anticipatedQuestions"],
            message: "anticipated Q&A cites unknown evidence",
          });
      }
      const ranks = report.anticipatedQuestions?.map((question) => question.rank) ?? [];
      if (new Set(ranks).size !== ranks.length)
        context.addIssue({
          code: "custom",
          path: ["anticipatedQuestions"],
          message: "anticipated Q&A ranks must be unique",
        });
    }
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
    if (report.researchTarget.kind === "committee") {
      if (report.teamViews.length !== WORKFLOW_V1_DEPARTMENT_IDS.length)
        context.addIssue({
          code: "custom",
          path: ["teamViews"],
          message: "committee reports require all four team views",
        });
      for (const message of artifactProvenanceErrors({
        artifacts: report.artifacts.filter(
          (
            artifact,
          ): artifact is z.infer<typeof AcceptedArtifactProvenanceSchema> =>
            artifact.stage === "memo" || artifact.stage === "chair_synthesis",
        ),
        runId: report.runId,
        snapshotId: report.snapshotId,
      }))
        context.addIssue({
          code: "custom",
          path: ["artifacts"],
          message,
        });
    } else {
      const department = report.researchTarget.departmentId;
      const memberIds =
        WORKFLOW_V1_ROLE_REGISTRY.departments[department].memberIds;
      const expectedLogicalIds = new Set([
        ...memberIds.map((roleId) => `memo:${roleId}`),
        `consolidation:${department}`,
      ]);
      const actualLogicalIds = new Set(
        report.artifacts.map((artifact) => artifact.logicalArtifactId),
      );
      if (
        report.teamViews.length !== 1 ||
        report.teamViews[0]?.departmentId !== department
      )
        context.addIssue({
          code: "custom",
          path: ["teamViews"],
          message: "department reports require exactly the selected team view",
        });
      if (
        actualLogicalIds.size !== expectedLogicalIds.size ||
        [...expectedLogicalIds].some((id) => !actualLogicalIds.has(id))
      )
        context.addIssue({
          code: "custom",
          path: ["artifacts"],
          message:
            "department report lineage must contain its team memos and consolidation",
        });
      for (const artifact of report.artifacts)
        if (
          artifact.runId !== report.runId ||
          artifact.snapshotId !== report.snapshotId
        )
          context.addIssue({
            code: "custom",
            path: ["artifacts"],
            message: "department report artifact lineage mismatch",
          });
    }
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

type VersionedResearchReport = z.infer<typeof VersionedResearchReportContractSchema>;
export type ResearchReport = VersionedResearchReport & {
  readonly schemaVersion: "workflow-v1";
};
export type WorkflowV2ResearchReport = VersionedResearchReport & {
  readonly schemaVersion: "workflow-v2";
  readonly editorialClaims: NonNullable<VersionedResearchReport["editorialClaims"]>;
  readonly editorialDecision: NonNullable<VersionedResearchReport["editorialDecision"]>;
  readonly comparators: NonNullable<VersionedResearchReport["comparators"]>;
  readonly anticipatedQuestions: NonNullable<VersionedResearchReport["anticipatedQuestions"]>;
};

export const ResearchReportSchema = VersionedResearchReportContractSchema
  .refine((report) => report.schemaVersion === "workflow-v1", {
    path: ["schemaVersion"],
    message: "legacy schema requires workflow-v1",
  })
  .transform((report) => report as ResearchReport);

export const WorkflowV2ResearchReportSchema = VersionedResearchReportContractSchema
  .refine((report) => report.schemaVersion === "workflow-v2", {
    path: ["schemaVersion"],
    message: "editorial schema requires workflow-v2",
  })
  .transform((report) => report as WorkflowV2ResearchReport);
