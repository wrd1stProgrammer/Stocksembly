import { canonicalJson, hashCanonical } from "../domain/contractHelpers";
import {
  ArtifactIdSchema,
  ReportIdSchema,
  ReportVersionIdSchema,
} from "../domain/ids";
import {
  type WorkflowV2ResearchReport,
  WorkflowV2ResearchReportSchema,
} from "../domain/report";
import { singleLocaleReportForStorage } from "../domain/reportStorage";
import { normalizeReportNarrativeText } from "../domain/reportText";
import {
  type ArtifactCasPort,
  type ArtifactDescriptor,
  ArtifactDigestSchema,
} from "../ports/artifacts";
import type { ReportVersionWrite } from "../ports/reportVersions";
import {
  deterministicMetadataRewrite,
  evaluatePrePublicationEditorialGate,
  gateWithOneTargetedRewrite,
  type PrePublicationEditorialEnvelope,
} from "../workflow/prePublicationEditorialGate";
import { assembleReport } from "./assembleReport";
import type { AssemblyInput } from "./assembleReportContracts";

export type AuthoritativeReportCommit = {
  readonly version: ReportVersionWrite;
  readonly descriptor: ArtifactDescriptor;
  readonly parentArtifactIds: readonly string[];
};

export type ReportVersionPersistence = {
  readonly save: (input: AuthoritativeReportCommit) => number;
};

type PersistenceOptions = {
  readonly cas: ArtifactCasPort;
  readonly persistence: ReportVersionPersistence;
  readonly now?: () => string;
  readonly reserveEditorialRewrite?: (inputHash: string) => boolean;
  readonly savedEditorialPublication?: PrePublicationEditorialEnvelope;
  readonly repairMetadata?: Readonly<{
    authorizationHash: string;
    supersedesVersion: number;
    projectionHash: string;
    persistenceHash: string;
  }>;
};

type AuthoritativeReportInput = AssemblyInput & {
  readonly reportArtifactId: string;
  readonly structuralAuditArtifactId: string;
  readonly parentArtifacts: readonly {
    readonly artifactId: string;
    readonly digest: string;
  }[];
};

export type PersistAuthoritativeReportResult =
  | {
      readonly kind: "published";
      readonly report: WorkflowV2ResearchReport;
      readonly descriptor: ArtifactDescriptor;
    }
  | { readonly kind: "blocked"; readonly reason: string };

export async function persistAuthoritativeReport(
  options: PersistenceOptions,
  input: AuthoritativeReportInput,
): Promise<PersistAuthoritativeReportResult> {
  const assembled = assembleReport(input);
  if (assembled.kind === "blocked") return assembled;
  const recomputedGate = await gateWithOneTargetedRewrite(
    assembled.editorialPublication.candidate,
    async (request) => {
      if (options.reserveEditorialRewrite?.(hashCanonical(request)) === false)
        return assembled.editorialPublication.candidate;
      return deterministicMetadataRewrite(
        assembled.editorialPublication.candidate,
        request,
      );
    },
  );
  const savedEditorialPublication = options.savedEditorialPublication;
  if (
    savedEditorialPublication !== undefined &&
    (recomputedGate.kind !== "accepted" ||
      savedEditorialPublication.gateVersion !== "editorial-quality-v1" ||
      hashCanonical(savedEditorialPublication.candidate) !==
        hashCanonical(recomputedGate.candidate) ||
      !evaluatePrePublicationEditorialGate(savedEditorialPublication.candidate)
        .publishable)
  )
    return { kind: "blocked", reason: "saved_editorial_authority_mismatch" };
  const gated =
    savedEditorialPublication === undefined
      ? recomputedGate
      : {
          kind: "accepted" as const,
          candidate: savedEditorialPublication.candidate,
          rewritten: Object.values(
            savedEditorialPublication.fieldLineage ?? {},
          ).includes("targeted_rewrite"),
          fieldLineage: savedEditorialPublication.fieldLineage ?? {},
        };
  if (gated.kind === "rejected")
    return { kind: "blocked", reason: gated.reason };
  const editorialPublication = {
    ...assembled.editorialPublication,
    qaPolicy: {
      ...assembled.editorialPublication.qaPolicy,
      supportedCount: gated.candidate.anticipatedQuestions.length,
      moduleVisible:
        gated.candidate.anticipatedQuestions.length >=
        assembled.editorialPublication.qaPolicy.moduleMinimum,
    },
    candidate: gated.candidate,
    fieldLineage: gated.fieldLineage,
  };
  const retainedSectionKeys = new Set(
    gated.candidate.sections.map((section) => section.sectionKey),
  );
  const gatedSections = new Map(
    gated.candidate.sections.map((section) => [section.sectionKey, section]),
  );
  const localizedSections = (locale: "en" | "ko") =>
    assembled.report.locales[locale].sections
      .filter((section) => retainedSectionKeys.has(section.id))
      .map((section) => {
        const gatedSection = gatedSections.get(section.id);
        return gatedSection === undefined
          ? section
          : {
              ...section,
              body: normalizeReportNarrativeText(
                gatedSection.text[locale],
                section.body,
              ),
              claimIds: gatedSection.claimIds,
            };
      });
  const publicationQuestions = gated.candidate.anticipatedQuestions.map(
    (question) => ({
      ...question,
      question: {
        en: normalizeReportNarrativeText(
          question.question.en,
          "Which evidence would change the current assessment?",
        ),
        ko: normalizeReportNarrativeText(
          question.question.ko,
          "현재 판단을 바꿀 근거는 무엇입니까?",
        ),
      },
      answer: {
        en: normalizeReportNarrativeText(
          question.answer.en,
          "The assessment changes when the cited evidence no longer supports its primary claim.",
        ),
        ko: normalizeReportNarrativeText(
          question.answer.ko,
          "인용된 근거가 핵심 주장을 더 이상 지지하지 않으면 현재 판단을 다시 검토합니다.",
        ),
      },
    }),
  );
  const publicationReport = WorkflowV2ResearchReportSchema.parse({
    ...assembled.report,
    teamViews: assembled.report.teamViews.map((teamView, index) =>
      index === 0
        ? {
            ...teamView,
            position: {
              en: normalizeReportNarrativeText(
                gated.candidate.position.en,
                teamView.position.en,
              ),
              ko: normalizeReportNarrativeText(
                gated.candidate.position.ko,
                teamView.position.ko,
              ),
            },
            rationale: {
              en: normalizeReportNarrativeText(
                gated.candidate.rationale.en,
                teamView.rationale.en,
              ),
              ko: normalizeReportNarrativeText(
                gated.candidate.rationale.ko,
                teamView.rationale.ko,
              ),
            },
          }
        : teamView,
    ),
    locales: {
      en: {
        ...assembled.report.locales.en,
        sections: localizedSections("en"),
      },
      ko: {
        ...assembled.report.locales.ko,
        sections: localizedSections("ko"),
      },
    },
    anticipatedQuestions: publicationQuestions,
  });
  const reportArtifactId = ArtifactIdSchema.safeParse(input.reportArtifactId);
  const reportId = ReportIdSchema.safeParse(input.reportId);
  const versionId = ReportVersionIdSchema.safeParse(input.versionId);
  const parentDigests = input.parentArtifacts.map((parent) =>
    ArtifactDigestSchema.safeParse(parent.digest),
  );
  const requiredParentIds = new Set([
    ...assembled.report.artifacts.map((artifact) => artifact.artifactId),
    input.semanticAudit !== null && typeof input.semanticAudit === "object"
      ? Reflect.get(input.semanticAudit, "artifactId")
      : undefined,
    input.structuralAuditArtifactId,
  ]);
  const requiredParentCount = assembled.report.artifacts.length + 2;
  if (
    !reportArtifactId.success ||
    !reportId.success ||
    !versionId.success ||
    parentDigests.length !== requiredParentCount ||
    parentDigests.some((digest) => !digest.success) ||
    new Set(input.parentArtifacts.map((parent) => parent.digest)).size !==
      requiredParentCount ||
    new Set(input.parentArtifacts.map((parent) => parent.artifactId)).size !==
      requiredParentCount ||
    requiredParentIds.size !== requiredParentCount ||
    input.parentArtifacts.some(
      (parent) => !requiredParentIds.has(parent.artifactId),
    )
  )
    return { kind: "blocked", reason: "invalid_persistence_lineage" };
  const parsedDigests = parentDigests.flatMap((digest) =>
    digest.success ? [digest.data] : [],
  );
  const authenticatedParents = await Promise.all(
    parsedDigests.map(async (digest) => await options.cas.get(digest)),
  );
  if (
    authenticatedParents.some((parent, index) => {
      const expected = input.parentArtifacts[index];
      return (
        parent === undefined ||
        expected === undefined ||
        parent.descriptor.artifactId !== expected.artifactId ||
        parent.descriptor.runId !== publicationReport.runId ||
        parent.descriptor.snapshotId !== publicationReport.snapshotId
      );
    })
  )
    return { kind: "blocked", reason: "parent_artifact_authentication_failed" };
  const bytes = new TextEncoder().encode(
    canonicalJson(
      singleLocaleReportForStorage(publicationReport, input.locale ?? "en"),
    ),
  );
  const descriptor = await options.cas.put({
    artifactId: reportArtifactId.data,
    runId: publicationReport.runId,
    snapshotId: publicationReport.snapshotId,
    mediaType: "application/vnd.stocksembly.research-report+json",
    parentDigests: parsedDigests,
    bytes,
  });
  options.persistence.save({
    descriptor,
    parentArtifactIds: input.parentArtifacts.map((parent) => parent.artifactId),
    version: {
      reportId: reportId.data,
      versionId: versionId.data,
      runId: publicationReport.runId,
      snapshotId: publicationReport.snapshotId,
      artifactId: reportArtifactId.data,
      status: publicationReport.status,
      publishedAt: options.now?.() ?? new Date().toISOString(),
      publicPayload: {
        schemaVersion: publicationReport.schemaVersion,
        reportArtifactDigest: descriptor.digest,
        version: publicationReport.version,
        priorVersionId: publicationReport.versionDelta.priorVersionId,
        status: publicationReport.status,
        claimIds: publicationReport.claims.map((claim) => claim.claimId),
        sourceIds: publicationReport.sources.map((source) => source.sourceId),
        limitationIds: publicationReport.limitations.map(
          (limitation) => limitation.id,
        ),
        anticipatedQuestions: publicationReport.anticipatedQuestions,
        editorialPublication,
        ...(options.repairMetadata === undefined
          ? {}
          : { repairMetadata: options.repairMetadata }),
      },
      expectedVersion: publicationReport.version,
      priorVersionId: publicationReport.versionDelta.priorVersionId,
    },
  });
  return { kind: "published", report: publicationReport, descriptor };
}
