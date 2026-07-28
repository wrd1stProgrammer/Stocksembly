import { createHash } from "node:crypto";
import { ArtifactIdSchema, RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import {
  REQUIRED_REPORT_ARTIFACT_ROLES,
  WORKFLOW_V1_REPORT_LOGICAL_ARTIFACT_IDS,
} from "../domain/report";
import type {
  ArtifactDescriptor,
  ArtifactDigest,
  ArtifactRead,
  ArtifactWrite,
} from "../ports/artifacts";
import { StrictArtifactCasFake } from "../ports/test/serviceFakes";
import type { AuthoritativeReportCommit } from "./assembleReportPersistence";
import { auditStructuralClaims } from "./structuralAudit";
import { makeStructuralAuditInput } from "./structuralAudit.testSupport";

const uuid = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export class CountingArtifactCasFake {
  readonly #delegate = new StrictArtifactCasFake();
  putCount = 0;

  async seed(artifact: ArtifactWrite): Promise<void> {
    await this.#delegate.put(artifact);
  }

  async put(artifact: ArtifactWrite): Promise<ArtifactDescriptor> {
    this.putCount += 1;
    return await this.#delegate.put(artifact);
  }

  async get(digestValue: ArtifactDigest): Promise<ArtifactRead | undefined> {
    return await this.#delegate.get(digestValue);
  }

  async has(digestValue: ArtifactDigest): Promise<boolean> {
    return await this.#delegate.has(digestValue);
  }
}

export function reportPersistenceSpy() {
  const saved: AuthoritativeReportCommit[] = [];
  return {
    saved,
    save(input: AuthoritativeReportCommit) {
      saved.push(input);
      return saved.length;
    },
  };
}

export function makeAuthoritativeReportInput() {
  const result = auditStructuralClaims(makeStructuralAuditInput("none"));
  const runId = result.runId;
  const snapshotId = result.snapshotId;
  const versionId = uuid(301);
  const sections = [
    "ten_second_brief",
    "supported_analysis",
    "operational_scenarios",
    "dissent_unknowns",
    "change_conditions",
  ] as const;
  return {
    reportId: uuid(300),
    reportArtifactId: uuid(302),
    versionId,
    version: 1,
    researchDirection: "Focus on margin durability",
    teamViews: [
      {
        departmentId: "market" as const,
        position: { en: "Demand is constructive.", ko: "수요는 견조합니다." },
        vote: "support_with_reservations" as const,
        rationale: { en: "Macro risk remains.", ko: "거시 위험이 남습니다." },
      },
      {
        departmentId: "company" as const,
        position: { en: "Execution is sound.", ko: "실행력은 견조합니다." },
        vote: "support" as const,
        rationale: { en: "Evidence is consistent.", ko: "근거가 일관됩니다." },
      },
      {
        departmentId: "financial" as const,
        position: { en: "Margins are improving.", ko: "마진이 개선됩니다." },
        vote: "support_with_reservations" as const,
        rationale: {
          en: "Price data is limited.",
          ko: "가격 데이터가 제한적입니다.",
        },
      },
      {
        departmentId: "risk" as const,
        position: {
          en: "Risks are manageable.",
          ko: "위험은 관리 가능합니다.",
        },
        vote: "abstain" as const,
        rationale: { en: "Unknowns remain.", ko: "미확인 사항이 남습니다." },
      },
    ],
    structuralAuditArtifactId: uuid(304),
    parentArtifacts: [
      ...REQUIRED_REPORT_ARTIFACT_ROLES.map((role, index) => ({
        artifactId: uuid(400 + index),
        digest: digest(role),
        seed: role,
      })),
      { artifactId: uuid(303), digest: digest("semantic"), seed: "semantic" },
      {
        artifactId: uuid(304),
        digest: digest("structural"),
        seed: "structural",
      },
    ],
    artifacts: REQUIRED_REPORT_ARTIFACT_ROLES.map((role, index) => ({
      artifactId: uuid(400 + index),
      logicalArtifactId: WORKFLOW_V1_REPORT_LOGICAL_ARTIFACT_IDS[role],
      roleId: role,
      stage: role === "chair" ? "chair_synthesis" : "memo",
      status: "accepted" as const,
      runId,
      snapshotId,
    })),
    authenticatedSources: [
      {
        sourceId: "00000000-0000-4000-8000-000000000005",
        title: "filing-span",
        publisher: "SEC",
        sourceClass: "sec_primary_filing",
        retrievedAt: "2026-01-20T00:00:00.000Z",
      },
      {
        sourceId: uuid(305),
        title: "memo:market",
        publisher: "market",
        sourceClass: "memo",
        retrievedAt: "2026-01-20T00:00:00.000Z",
      },
    ],
    structuralAudit: {
      kind: "structural_audit" as const,
      schemaVersion: "workflow-v1" as const,
      runId,
      snapshotId,
      auditHash: result.auditHash,
      claimSetHash: result.claimSetHash,
      publishable: result.publishable,
      result,
    },
    semanticAudit: {
      schemaVersion: "workflow-v1" as const,
      artifactId: uuid(303),
      runId,
      snapshotId,
      reportVersionId: versionId,
      verdicts: result.claims.map((claim) => ({
        claimId: claim.claimId,
        materiality: claim.materiality,
        verdict: "entailed" as const,
        contradictionSeverity: "none" as const,
        reason: "Fixed evidence entails the audited claim.",
      })),
      metrics: [{ id: "semantic_entailment", passed: 1, denominator: 1 }],
    },
    chairScenarioIds: ["scenario:revenue"],
    chairSentences: sections.map((sectionKey) => ({
      sentenceId:
        sectionKey === "operational_scenarios"
          ? "scenario:revenue"
          : `sentence:${sectionKey}`,
      kind:
        sectionKey === "operational_scenarios"
          ? ("scenario" as const)
          : sectionKey === "dissent_unknowns"
            ? ("dissent" as const)
            : ("claim" as const),
      claimIds: result.claims.map((claim) => claim.claimId),
      sourceArtifactIds: [uuid(305)],
      text: result.claims[0]?.text ?? {
        en: "Missing claim.",
        ko: "주장이 없습니다.",
      },
    })),
    chair: {
      kind: "chair_synthesis" as const,
      sourceArtifactIds: [uuid(303)],
      sections: sections.map((sectionKey) => ({
        sectionId: sectionKey,
        sectionKey,
        publicSummary: result.claims[0]?.text ?? {
          en: "Missing claim.",
          ko: "주장이 없습니다.",
        },
        sentenceIds: [
          sectionKey === "operational_scenarios"
            ? "scenario:revenue"
            : `sentence:${sectionKey}`,
        ],
        auditedClaimIds: result.claims.map((claim) => claim.claimId),
        sourceArtifactIds: [uuid(305)],
      })),
      ballotArtifactIds: [uuid(501), uuid(502), uuid(503), uuid(504)],
      dissentClaimIds: result.retainedDissentClaimIds,
      unknowns: result.retainedOpenQuestions.map((question) => question.text),
    },
  };
}

export async function seedAuthoritativeParents(
  cas: CountingArtifactCasFake,
  input: ReturnType<typeof makeAuthoritativeReportInput>,
): Promise<void> {
  await Promise.all(
    input.parentArtifacts.map(async (parent) => {
      await cas.seed({
        artifactId: ArtifactIdSchema.parse(parent.artifactId),
        runId: RunIdSchema.parse(input.structuralAudit.runId),
        snapshotId: SnapshotIdSchema.parse(input.structuralAudit.snapshotId),
        mediaType: "application/json",
        parentDigests: [],
        bytes: new TextEncoder().encode(parent.seed),
      });
    }),
  );
}
