import { createHash } from "node:crypto";
import { ArtifactIdSchema, RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import { AtomicEditorialClaimSchema } from "../domain/agentOutputs";
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
    "valuation_comparison",
    "operational_scenarios",
    "dissent_unknowns",
    "change_conditions",
  ] as const;
  const sectionText = {
    ten_second_brief: { en: "Revenue evidence favors waiting for proof.", ko: "매출 근거는 추가 확인을 기다리는 판단을 지지합니다." },
    supported_analysis: { en: "Filing evidence confirms the reported operating trend.", ko: "공시 근거는 보고된 운영 추세를 확인합니다." },
    valuation_comparison: { en: "Valuation comparison remains conditional on aligned periods.", ko: "밸류에이션 비교는 기간 정렬을 전제로 합니다." },
    operational_scenarios: { en: "The revenue scenario defines an observable operating range.", ko: "매출 시나리오는 관찰 가능한 운영 범위를 제시합니다." },
    dissent_unknowns: { en: "The retained dissent identifies unresolved execution risk.", ko: "유지된 이견은 미해결 실행 위험을 식별합니다." },
    change_conditions: { en: "A later filing would change the registered conclusion.", ko: "후속 공시는 기록된 결론을 변경할 수 있습니다." },
  } as const;
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
    editorialClaims: result.claims.flatMap((claim) =>
      claim.changeCondition === undefined
        ? []
        : [AtomicEditorialClaimSchema.parse({
            claimId: claim.claimId,
            decisionDimension: "growth_engine" as const,
            roleOwner: "market",
            stanceContribution: "uncertain" as const,
            materiality: claim.materiality,
            publicThesis: claim.text,
            evidenceArtifactIds: ["00000000-0000-4000-8000-000000000005"],
            counterevidenceArtifactIds: [],
            decisiveMetricIds: [],
            falsifier: {
              en: claim.changeCondition.en,
              ko: claim.changeCondition.ko,
            },
          })],
    ),
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
      text: sectionText[sectionKey],
    })),
    chair: {
      kind: "chair_synthesis" as const,
      sourceArtifactIds: [uuid(303)],
      decisionBrief: {
        stance: "wait_for_proof" as const,
        confidence: "medium" as const,
        decisiveReason: result.claims[0]?.text ?? { en: "Missing claim.", ko: "주장이 없습니다." },
        strongestCountercase: result.claims[0]?.text ?? { en: "Missing claim.", ko: "주장이 없습니다." },
        falsifier: result.claims[0]?.text ?? { en: "Missing claim.", ko: "주장이 없습니다." },
        primaryClaimIds: result.claims.slice(0, 1).map((claim) => claim.claimId),
        decisiveSentenceId: "sentence:ten_second_brief",
        countercaseSentenceId: "sentence:ten_second_brief",
        falsifierSentenceId: "sentence:ten_second_brief",
        primarySentenceIds: ["sentence:ten_second_brief"],
      },
      sections: sections.map((sectionKey) => ({
        sectionId: sectionKey,
        sectionKey,
        publicSummary: sectionText[sectionKey],
        primarySentenceId:
          sectionKey === "operational_scenarios"
            ? "scenario:revenue"
            : `sentence:${sectionKey}`,
        sentenceIds: [
          sectionKey === "operational_scenarios"
            ? "scenario:revenue"
            : `sentence:${sectionKey}`,
        ],
        auditedClaimIds: result.claims.map((claim) => claim.claimId),
        sourceArtifactIds: [uuid(305)],
        ...(sectionKey === "supported_analysis"
          ? {
              conflictAdjudication: {
                departmentDecisionSentenceIds: ["position:market", "position:company"],
                resolution: "proof_required" as const,
                reasonSentenceId: "sentence:supported_analysis",
              },
            }
          : {}),
      })),
      ballotArtifactIds: [uuid(501), uuid(502), uuid(503), uuid(504)],
      dissentClaimIds: result.retainedDissentClaimIds,
      selectedUnknownIds: result.retainedOpenQuestions
        .slice(0, 2)
        .map((question) => question.questionId),
      unknowns: result.retainedOpenQuestions
        .slice(0, 2)
        .map((question) => question.text),
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
