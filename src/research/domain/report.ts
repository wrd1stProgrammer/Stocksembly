import { z } from "zod";
import {
  ChairSynthesisV3CanonicalNarrativeSchema,
  ChairSynthesisV3LineageSchema,
} from "./chairSynthesisOutput";
import { evaluateEditorialStance } from "./editorialStance";
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

const CanonicalTeamViewSchema = z
  .object({
    departmentId: z.enum(WORKFLOW_V1_DEPARTMENT_IDS),
    position: z.string().trim().min(1),
    vote: z.enum(["support", "support_with_reservations", "oppose", "abstain"]),
    rationale: z.string().trim().min(1),
  })
  .strict();

const CanonicalClaimRegisterEntrySchema = ClaimRegisterEntrySchema.omit({
  text: true,
  checkpoint: true,
  adjudicationReason: true,
}).extend({
  text: z.string().trim().min(1).optional(),
  checkpoint: z.string().trim().min(1).optional(),
  adjudicationReason: z.string().trim().min(1).optional(),
});

const CanonicalProviderDisagreementSchema = ProviderDisagreementSchema.omit({
  note: true,
}).extend({ note: z.string().trim().min(1).max(1_000) });

const CanonicalEditorialClaimSchema = z
  .object({
    claimId: z.string().uuid(),
    decisionDimension: z.string().trim().min(1),
    roleOwner: z.string().trim().min(1),
    stanceContribution: z.enum(["supports", "opposes", "uncertain"]),
    materiality: z.enum(["material", "supporting"]),
    publicThesis: z.string().trim().min(1),
    evidenceArtifactIds: z.array(z.string().uuid()),
    counterevidenceArtifactIds: z.array(z.string().uuid()),
    decisiveMetricIds: z.array(z.string().trim().min(1).max(240)).max(3),
    falsifier: z.string().trim().min(1),
  })
  .strict();

const CanonicalEditorialDecisionSchema = z
  .object({
    stance: z.enum([
      "upside_skewed",
      "downside_skewed",
      "balanced",
      "insufficient_evidence",
    ]),
    confidence: z.enum(["high", "medium", "low"]),
    decisiveReason: z.string().trim().min(1),
    strongestCountercase: z.string().trim().min(1),
    falsifier: z.string().trim().min(1),
    primaryClaimIds: z.array(z.string().uuid()),
  })
  .strict();

const CanonicalComparatorSchema = z
  .object({
    comparatorId: z.string().trim().min(1).max(120),
    role: z.enum([
      "direct_competitor",
      "operating_comparable",
      "valuation_proxy",
    ]),
    rationale: z.string().trim().min(1),
    comparableMetricKeys: z.array(z.string().trim().min(1)),
  })
  .strict();

const CanonicalQuestionAnswerSchema = z
  .object({
    questionId: z.string().uuid(),
    decisionKey: z.string().trim().min(1),
    question: z.string().trim().min(1),
    answer: z.string().trim().min(1),
    primaryClaimIds: z.array(z.string().uuid()),
    evidenceArtifactIds: z.array(z.string().uuid()),
    rank: z.number().int().positive(),
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
    anticipatedQuestions: z
      .array(PersistedQuestionAnswerSchema)
      .max(32)
      .optional(),
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
      const registeredClaimIds = new Set(
        report.claims.map((claim) => claim.claimId),
      );
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
          [
            ...claim.evidenceArtifactIds,
            ...claim.counterevidenceArtifactIds,
          ].some((artifactId) => !artifactIds.has(artifactId))
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
        if (
          question.evidenceArtifactIds.some(
            (artifactId) => !artifactIds.has(artifactId),
          )
        )
          context.addIssue({
            code: "custom",
            path: ["anticipatedQuestions"],
            message: "anticipated Q&A cites unknown evidence",
          });
      }
      const ranks =
        report.anticipatedQuestions?.map((question) => question.rank) ?? [];
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

type VersionedResearchReport = z.infer<
  typeof VersionedResearchReportContractSchema
>;
export type ResearchReport = VersionedResearchReport & {
  readonly schemaVersion: "workflow-v1";
};
export type WorkflowV2ResearchReport = VersionedResearchReport & {
  readonly schemaVersion: "workflow-v2";
  readonly editorialClaims: NonNullable<
    VersionedResearchReport["editorialClaims"]
  >;
  readonly editorialDecision: NonNullable<
    VersionedResearchReport["editorialDecision"]
  >;
  readonly comparators: NonNullable<VersionedResearchReport["comparators"]>;
  readonly anticipatedQuestions: NonNullable<
    VersionedResearchReport["anticipatedQuestions"]
  >;
};

export const ResearchReportSchema =
  VersionedResearchReportContractSchema.refine(
    (report) => report.schemaVersion === "workflow-v1",
    {
      path: ["schemaVersion"],
      message: "legacy schema requires workflow-v1",
    },
  ).transform((report) => report as ResearchReport);

export const WorkflowV2ResearchReportSchema =
  VersionedResearchReportContractSchema.refine(
    (report) => report.schemaVersion === "workflow-v2",
    {
      path: ["schemaVersion"],
      message: "editorial schema requires workflow-v2",
    },
  ).transform((report) => report as WorkflowV2ResearchReport);

const WorkflowV3ResearchReportContractSchema = z
  .object({
    schemaVersion: z.literal("workflow-v3"),
    sourceLocale: z.enum(["en", "ko"]),
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
    teamViews: z.array(CanonicalTeamViewSchema).min(1).max(4),
    artifacts: z.array(
      z.union([
        AcceptedArtifactProvenanceSchema,
        DepartmentReportArtifactProvenanceSchema,
      ]),
    ),
    capabilities: z.array(CapabilitySummarySchema).min(1),
    narrative: LocalizedReportSchema,
    versionDelta: VersionDeltaSchema,
    claims: z.array(CanonicalClaimRegisterEntrySchema),
    sources: z.array(SourceRegisterEntrySchema),
    dataCoverage: z.array(DataCoverageSchema).min(1),
    providerDisagreements: z.array(CanonicalProviderDisagreementSchema),
    metrics: z.array(StructuralMetricSchema).min(1),
    limitations: z.array(LimitationSchema),
    editorialClaims: z.array(CanonicalEditorialClaimSchema).max(64),
    editorialDecision: CanonicalEditorialDecisionSchema,
    comparators: z.array(CanonicalComparatorSchema).max(64),
    anticipatedQuestions: z.array(CanonicalQuestionAnswerSchema).max(32),
    narrativeLineage: z
      .object({
        decision: z
          .object({
            decisiveReason: ChairSynthesisV3LineageSchema,
            strongestCountercase: ChairSynthesisV3LineageSchema,
            invalidationCheckpoint: ChairSynthesisV3LineageSchema,
          })
          .strict(),
        teamViews: z.array(
          z
            .object({
              departmentId: z.enum(WORKFLOW_V1_DEPARTMENT_IDS),
              lineage: ChairSynthesisV3LineageSchema,
            })
            .strict(),
        ),
        sections: z.array(
          z
            .object({
              sectionKey: z.string().trim().min(1).max(80),
              lineage: ChairSynthesisV3LineageSchema,
            })
            .strict(),
        ),
        anticipatedQuestions: z.array(
          z
            .object({
              index: z.number().int().nonnegative(),
              lineage: ChairSynthesisV3LineageSchema,
            })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict();

type WorkflowV3ResearchReportInput = z.infer<
  typeof WorkflowV3ResearchReportContractSchema
>;

function mirroredCanonicalText(value: string) {
  return { en: value, ko: value };
}

function compatibilityNarrativeLineage(
  report: WorkflowV2ResearchReport,
  sourceLocale: "en" | "ko",
) {
  const artifact = report.artifacts[0];
  if (artifact === undefined)
    throw new TypeError("workflow_v3_lineage_artifact_required");
  const lineage = (sentenceId: string, claimIds: readonly string[] = []) => ({
    sentenceIds: [sentenceId],
    claimIds,
    sourceArtifactIds: [artifact.artifactId],
  });
  const decisionLineage = lineage(
    "legacy:decision",
    report.editorialDecision.primaryClaimIds,
  );
  return {
    decision: {
      decisiveReason: decisionLineage,
      strongestCountercase: decisionLineage,
      invalidationCheckpoint: decisionLineage,
    },
    teamViews: report.teamViews.map((view) => ({
      departmentId: view.departmentId,
      lineage: decisionLineage,
    })),
    sections: report.locales[sourceLocale].sections.map((section) => ({
      sectionKey: section.id,
      lineage: lineage(`legacy:section:${section.id}`, section.claimIds),
    })),
    anticipatedQuestions: report.anticipatedQuestions.map(
      (question, index) => ({
        index,
        lineage: lineage(`legacy:question:${index}`, question.primaryClaimIds),
      }),
    ),
  };
}

function projectWorkflowV3ForCompatibility(
  report: WorkflowV3ResearchReportInput,
): unknown {
  const {
    sourceLocale: _sourceLocale,
    narrative,
    narrativeLineage: _narrativeLineage,
    ...common
  } = report;
  return {
    ...common,
    schemaVersion: "workflow-v2",
    locales: { en: narrative, ko: narrative },
    teamViews: report.teamViews.map((view) => ({
      ...view,
      position: mirroredCanonicalText(view.position),
      rationale: mirroredCanonicalText(view.rationale),
    })),
    claims: report.claims.map((claim) => ({
      ...claim,
      ...(claim.text === undefined
        ? {}
        : { text: mirroredCanonicalText(claim.text) }),
      ...(claim.checkpoint === undefined
        ? {}
        : { checkpoint: mirroredCanonicalText(claim.checkpoint) }),
      ...(claim.adjudicationReason === undefined
        ? {}
        : {
            adjudicationReason: mirroredCanonicalText(claim.adjudicationReason),
          }),
    })),
    providerDisagreements: report.providerDisagreements.map((entry) => ({
      ...entry,
      note: mirroredCanonicalText(entry.note),
    })),
    editorialClaims: report.editorialClaims.map((claim) => ({
      ...claim,
      publicThesis: mirroredCanonicalText(claim.publicThesis),
      falsifier: mirroredCanonicalText(claim.falsifier),
    })),
    editorialDecision: {
      ...report.editorialDecision,
      decisiveReason: mirroredCanonicalText(
        report.editorialDecision.decisiveReason,
      ),
      strongestCountercase: mirroredCanonicalText(
        report.editorialDecision.strongestCountercase,
      ),
      falsifier: mirroredCanonicalText(report.editorialDecision.falsifier),
    },
    comparators: report.comparators.map((comparator) => ({
      ...comparator,
      rationale: mirroredCanonicalText(comparator.rationale),
    })),
    anticipatedQuestions: report.anticipatedQuestions.map((question) => ({
      ...question,
      question: mirroredCanonicalText(question.question),
      answer: mirroredCanonicalText(question.answer),
    })),
  };
}

export type WorkflowV3ResearchReport = WorkflowV3ResearchReportInput;

export const WorkflowV3ResearchReportSchema =
  WorkflowV3ResearchReportContractSchema.superRefine((report, context) => {
    if (
      report.narrativeLineage.teamViews.length !== report.teamViews.length ||
      report.narrativeLineage.sections.length !==
        report.narrative.sections.length ||
      report.narrativeLineage.anticipatedQuestions.length !==
        report.anticipatedQuestions.length
    )
      context.addIssue({
        code: "custom",
        path: ["narrativeLineage"],
        message: "canonical narrative lineage coverage mismatch",
      });
    const projected = VersionedResearchReportContractSchema.safeParse(
      projectWorkflowV3ForCompatibility(report),
    );
    if (projected.success) return;
    for (const issue of projected.error.issues)
      context.addIssue({
        code: "custom",
        path: issue.path,
        message: issue.message,
      });
  }).readonly();

export function workflowV3ReportForPresentation(
  report: WorkflowV3ResearchReport,
): WorkflowV2ResearchReport {
  return WorkflowV2ResearchReportSchema.parse(
    projectWorkflowV3ForCompatibility(report),
  );
}

export function workflowV3ReportFromWorkflowV2(
  report: WorkflowV2ResearchReport,
  sourceLocale: "en" | "ko",
  stance:
    | "upside_skewed"
    | "downside_skewed"
    | "balanced"
    | "insufficient_evidence" = evaluateEditorialStance(
    report.editorialClaims.map((claim) => ({
      issuerSecurity: report.reportId,
      metricOrEventIdentity: claim.claimId,
      periodOrAsOf: report.snapshotId,
      direction:
        claim.stanceContribution === "supports"
          ? "upside"
          : claim.stanceContribution === "opposes"
            ? "downside"
            : "uncertain",
      materiality: claim.materiality,
      sourceQualified: claim.evidenceArtifactIds.length > 0,
      semanticQualified:
        report.claims.find((item) => item.claimId === claim.claimId)
          ?.semanticVerdict === "entailed",
    })),
  ).stance,
): WorkflowV3ResearchReport {
  const { locales: _locales, ...common } = report;
  return WorkflowV3ResearchReportSchema.parse({
    ...common,
    schemaVersion: "workflow-v3",
    sourceLocale,
    narrativeLineage: compatibilityNarrativeLineage(report, sourceLocale),
    narrative: report.locales[sourceLocale],
    teamViews: report.teamViews.map((view) => ({
      ...view,
      position: view.position[sourceLocale],
      rationale: view.rationale[sourceLocale],
    })),
    claims: report.claims.map((claim) => ({
      ...claim,
      ...(claim.text === undefined ? {} : { text: claim.text[sourceLocale] }),
      ...(claim.checkpoint === undefined
        ? {}
        : { checkpoint: claim.checkpoint[sourceLocale] }),
      ...(claim.adjudicationReason === undefined
        ? {}
        : { adjudicationReason: claim.adjudicationReason[sourceLocale] }),
    })),
    providerDisagreements: report.providerDisagreements.map((entry) => ({
      ...entry,
      note: entry.note[sourceLocale],
    })),
    editorialClaims: report.editorialClaims.map((claim) => ({
      ...claim,
      publicThesis: claim.publicThesis[sourceLocale],
      falsifier: claim.falsifier[sourceLocale],
    })),
    editorialDecision: {
      ...report.editorialDecision,
      stance,
      decisiveReason: report.editorialDecision.decisiveReason[sourceLocale],
      strongestCountercase:
        report.editorialDecision.strongestCountercase[sourceLocale],
      falsifier: report.editorialDecision.falsifier[sourceLocale],
    },
    comparators: report.comparators.map((comparator) => ({
      ...comparator,
      rationale: comparator.rationale[sourceLocale],
    })),
    anticipatedQuestions: report.anticipatedQuestions.map((question) => ({
      ...question,
      question: question.question[sourceLocale],
      answer: question.answer[sourceLocale],
    })),
  });
}

export function workflowV3ReportFromCanonicalNarrative(
  report: WorkflowV2ResearchReport,
  canonicalInput: z.infer<typeof ChairSynthesisV3CanonicalNarrativeSchema>,
  sectionClaimIds: ReadonlyMap<string, readonly string[]> = new Map(),
  anticipatedQuestionIndexes: readonly number[] = canonicalInput.anticipatedQuestions.map(
    (_, index) => index,
  ),
): WorkflowV3ResearchReport {
  const canonical =
    ChairSynthesisV3CanonicalNarrativeSchema.parse(canonicalInput);
  const sourceLocale = canonical.sourceLocale;
  const { locales: _locales, ...common } = report;
  const sections: ReadonlyMap<string, string> = new Map(
    canonical.sections.map((section) => [
      section.sectionKey,
      section.narrative,
    ]),
  );
  const teamViews = new Map(
    canonical.teamViews.map((view) => [view.departmentId, view]),
  );
  const publishedQuestions = canonical.anticipatedQuestions.flatMap(
    (generated, index) => {
      const question =
        report.anticipatedQuestions[anticipatedQuestionIndexes[index] ?? index];
      return question === undefined ? [] : [{ generated, question }];
    },
  );
  return WorkflowV3ResearchReportSchema.parse({
    ...common,
    schemaVersion: "workflow-v3",
    sourceLocale,
    narrativeLineage: {
      decision: canonical.decisionLineage,
      teamViews: canonical.teamViews.map((view) => ({
        departmentId: view.departmentId,
        lineage: view.lineage,
      })),
      sections: canonical.sections.map((section) => ({
        sectionKey: section.sectionKey,
        lineage: section.lineage,
      })),
      anticipatedQuestions: publishedQuestions.map(({ generated }, index) => ({
        index,
        lineage: generated.lineage,
      })),
    },
    narrative: {
      ...report.locales[sourceLocale],
      sections: report.locales[sourceLocale].sections.map((section) => ({
        ...section,
        body: sections.get(section.id) ?? section.body,
        claimIds: sectionClaimIds.get(section.id) ?? section.claimIds,
      })),
    },
    teamViews: report.teamViews.map((view) => {
      const generated = teamViews.get(view.departmentId);
      if (generated === undefined)
        throw new TypeError("chair_v3_team_view_missing");
      return {
        ...view,
        position: generated.position,
        rationale: generated.rationale,
        vote: generated.vote,
      };
    }),
    claims: report.claims.map((claim) => ({
      ...claim,
      ...(claim.text === undefined ? {} : { text: claim.text[sourceLocale] }),
      ...(claim.checkpoint === undefined
        ? {}
        : { checkpoint: claim.checkpoint[sourceLocale] }),
      ...(claim.adjudicationReason === undefined
        ? {}
        : { adjudicationReason: claim.adjudicationReason[sourceLocale] }),
    })),
    providerDisagreements: report.providerDisagreements.map((entry) => ({
      ...entry,
      note: entry.note[sourceLocale],
    })),
    editorialClaims: report.editorialClaims.map((claim) => ({
      ...claim,
      publicThesis: claim.publicThesis[sourceLocale],
      falsifier: claim.falsifier[sourceLocale],
    })),
    editorialDecision: {
      ...report.editorialDecision,
      stance: canonical.stance,
      decisiveReason: canonical.decisiveReason,
      strongestCountercase: canonical.strongestCountercase,
      falsifier: canonical.invalidationCheckpoint,
    },
    comparators: report.comparators.map((comparator) => ({
      ...comparator,
      rationale: comparator.rationale[sourceLocale],
    })),
    anticipatedQuestions: publishedQuestions.map(({ generated, question }) => ({
      ...question,
      question: generated.question,
      answer: generated.answer,
    })),
  });
}
