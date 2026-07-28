import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAtomicClaim } from "../domain/claims";
import { hashBytes } from "../domain/contractHelpers";
import { ArtifactIdSchema, ClaimIdSchema, RunIdSchema } from "../domain/ids";
import { ArtifactDigestSchema } from "../ports/artifacts";
import { createSqliteChallengeRound } from "../workflow/challengeRound";
import { stageAcceptedDepartments } from "../workflow/challengeRound.testSupport";
import { createSqliteFollowupAndResponseRound } from "../workflow/followupAndResponseRound";
import { FollowupResponseCodexFake } from "../workflow/followupAndResponseRound.testSupport";
import { persistStructuralAudit } from "../workflow/structuralAuditPersistence";
import { workflowOpenQuestion } from "../workflow/structuralAuditWorkflowRegister";
import { makePersistableStructuralInput } from "./structuralAuditPersistence.testSupport";
import {
  StructuralAuditArtifactEnvelopeSchema,
  type StructuralAuditPersistenceOptions,
} from "./structuralAuditPersistenceContracts";

const roots: string[] = [];

async function fixture(completeWorkflow = true) {
  const root = await mkdtemp(join(tmpdir(), "stocksembly-structural-"));
  roots.push(root);
  const codex = new FollowupResponseCodexFake("none");
  const prepared = await stageAcceptedDepartments(root, "none", codex);
  if (completeWorkflow) {
    const challenges = createSqliteChallengeRound(prepared.options);
    await challenges.stage({
      runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
      consolidationArtifactIds: prepared.departmentReplay.artifactIds.map(
        (artifactId) => ArtifactIdSchema.parse(artifactId),
      ),
    });
    const challengeReplay = await challenges.drain(
      prepared.harness.input.mandate.runId,
    );
    await challenges.close();
    const responses = createSqliteFollowupAndResponseRound(prepared.options);
    await responses.stage({
      runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
      challengeArtifactIds: challengeReplay.artifactIds.map((artifactId) =>
        ArtifactIdSchema.parse(artifactId),
      ),
    });
    await responses.drain(prepared.harness.input.mandate.runId);
    await responses.close();
  }
  const options: StructuralAuditPersistenceOptions = {
    databasePath: prepared.options.databasePath,
    cas: prepared.harness.cas,
    now: () => "2026-07-23T00:01:00.000Z",
  };
  return {
    prepared,
    options,
    input: makePersistableStructuralInput(prepared.harness),
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("persisted structural audit authority", () => {
  it("binds the immutable audit to trusted memo and source artifacts", async () => {
    // Given
    const { prepared, options, input } = await fixture();

    // When
    const first = await persistStructuralAudit(options, input);
    const replay = await persistStructuralAudit(options, input);

    // Then
    expect(first.kind).toBe("persisted");
    expect(replay).toEqual(first);
    if (first.kind !== "persisted") return;
    const artifact = await prepared.harness.cas.get(
      ArtifactDigestSchema.parse(first.structuralAuditContentHash),
    );
    const envelope = StructuralAuditArtifactEnvelopeSchema.parse(
      JSON.parse(new TextDecoder().decode(artifact?.bytes)),
    );
    expect(
      envelope.result.publishable,
      JSON.stringify(envelope.result.blockers),
    ).toBe(true);
    expect(envelope.result.fixedEvidenceSlices[0]?.evidence[0]?.exactText).toBe(
      input.evidence[0]?.content,
    );
    const database = new Database(options.databasePath);
    const counts = database
      .prepare(`SELECT
        (SELECT COUNT(*) FROM artifacts
          WHERE logical_key = 'structural_audit:system') AS artifacts,
        (SELECT COUNT(*) FROM run_events
          WHERE event_type = 'structural_audit_completed') AS events,
        (SELECT payload_json FROM run_events
          WHERE event_type = 'structural_audit_completed') AS payload_json,
        (SELECT COUNT(*) FROM artifact_edges
          WHERE child_artifact_id = ?) AS edges`)
      .get(first.structuralAuditArtifactId);
    database.close();
    expect(counts).toMatchObject({ artifacts: 1, events: 1, edges: 24 });
    const payload = JSON.parse(
      z.object({ payload_json: z.string() }).parse(counts).payload_json,
    );
    expect(payload).toMatchObject({
      schemaVersion: "workflow-v1",
      artifactId: first.structuralAuditArtifactId,
      participantIds: [],
      summary: {
        en: "Structural evidence audit completed.",
        ko: "구조적 근거 감사가 완료됐습니다.",
      },
    });
  });

  it("does not seal before all 22 authenticated workflow artifacts exist", async () => {
    // Given
    const { options, input } = await fixture(false);

    // When
    const result = await persistStructuralAudit(options, input);

    // Then
    expect(result).toEqual({
      kind: "blocked",
      reason: "accepted_workflow_set_incomplete",
    });
  });

  it("blocks caller omission of dissent present in authenticated parents", async () => {
    // Given
    const { prepared, options, input } = await fixture();

    // When
    const result = await persistStructuralAudit(options, {
      ...input,
      sourceDissentClaimIds: [],
      retainedDissentClaimIds: [],
      sourceOpenQuestionIds: [],
      retainedOpenQuestionIds: [],
      sourceOpenQuestions: [],
      retainedOpenQuestions: [],
    });

    // Then
    expect(result.kind).toBe("persisted");
    if (result.kind !== "persisted") return;
    const artifact = await prepared.harness.cas.get(
      ArtifactDigestSchema.parse(result.structuralAuditContentHash),
    );
    const envelope = StructuralAuditArtifactEnvelopeSchema.parse(
      JSON.parse(new TextDecoder().decode(artifact?.bytes)),
    );
    expect(envelope.result.publishable).toBe(false);
    expect(envelope.result.blockers).toContain("dissent_retention");
    expect(envelope.result.blockers).not.toContain("open_question_retention");
  });

  it("blocks a caller-injected question that has no authenticated lifecycle", async () => {
    // Given
    const { prepared, options, input } = await fixture();
    const injected = workflowOpenQuestion(input.runId, {
      en: "Caller injected an unauthenticated question.",
      ko: "호출자가 인증되지 않은 질문을 주입했습니다.",
    });

    // When
    const result = await persistStructuralAudit(options, {
      ...input,
      sourceOpenQuestionIds: [injected.questionId],
      retainedOpenQuestionIds: [injected.questionId],
      sourceOpenQuestions: [injected],
      retainedOpenQuestions: [injected],
    });

    // Then
    expect(result.kind).toBe("persisted");
    if (result.kind !== "persisted") return;
    const artifact = await prepared.harness.cas.get(
      ArtifactDigestSchema.parse(result.structuralAuditContentHash),
    );
    const envelope = StructuralAuditArtifactEnvelopeSchema.parse(
      JSON.parse(new TextDecoder().decode(artifact?.bytes)),
    );
    expect(envelope.result.publishable).toBe(false);
    expect(envelope.result.blockers).toContain("open_question_retention");
  });

  it("rejects parent metadata that no longer binds to its CAS envelope", async () => {
    // Given
    const { options, input } = await fixture();
    const database = new Database(options.databasePath);
    database
      .prepare(`UPDATE artifacts SET content_hash = ?
        WHERE artifact_id = (
          SELECT agent_output_commits.artifact_id
          FROM agent_output_commits JOIN attempts USING(attempt_id)
          WHERE attempts.logical_artifact_key = 'memo:market'
        )`)
      .run("f".repeat(64));
    database.close();

    // When
    const result = await persistStructuralAudit(options, input);

    // Then
    expect(result).toEqual({
      kind: "blocked",
      reason: "workflow_artifact_authentication_failed",
    });
  });

  it("rejects caller-self-consistent bytes that differ from trusted CAS", async () => {
    // Given
    const { options, input } = await fixture();
    const forged = "caller supplied source";
    const evidence = input.evidence[0];
    if (evidence === undefined) throw new TypeError("evidence fixture missing");

    // When
    const result = await persistStructuralAudit(options, {
      ...input,
      evidence: [
        {
          ...evidence,
          content: forged,
          contentHash: hashBytes(forged),
          span: { start: 0, end: forged.length, textHash: hashBytes(forged) },
        },
      ],
    });

    // Then
    expect(result).toEqual({
      kind: "blocked",
      reason: "artifact_content_mismatch",
    });
  });

  it("rejects an untrusted locator and a missing artifact", async () => {
    // Given
    const { options, input } = await fixture();
    const evidence = input.evidence[0];
    if (evidence === undefined) throw new TypeError("evidence fixture missing");

    // When
    const wrongLocator = await persistStructuralAudit(options, {
      ...input,
      evidence: [{ ...evidence, locatorHash: "f".repeat(64) }],
    });
    const missingArtifact = await persistStructuralAudit(options, {
      ...input,
      evidence: [
        {
          ...evidence,
          artifactId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        },
      ],
    });

    // Then
    expect(wrongLocator).toEqual({
      kind: "blocked",
      reason: "locator_hash_mismatch",
    });
    expect(missingArtifact).toEqual({
      kind: "blocked",
      reason: "evidence_artifact_missing",
    });
  });

  it("makes a persisted claim set immutable", async () => {
    // Given
    const { options, input } = await fixture();
    const accepted = await persistStructuralAudit(options, input);
    const first = input.claims[0];
    if (first === undefined) throw new TypeError("claim fixture missing");
    const original = first.claim;
    const addedClaim = createAtomicClaim({
      claimId: ClaimIdSchema.parse(
        "00000000-0000-4000-8000-000000000905",
      ),
      runId: original.runId,
      snapshotId: original.snapshotId,
      text: original.text,
      epistemicClass: original.epistemicClass,
      stance: original.stance,
      materiality: original.materiality,
      claimType: original.claimType,
      supportingEvidence: original.supportingEvidence,
      opposingEvidence: original.opposingEvidence,
      asOf: original.asOf,
      freshness: original.freshness,
      uncertainty: original.uncertainty,
      ...(original.changeCondition === undefined
        ? {}
        : {
            changeCondition: {
              en: original.changeCondition.en,
              ko: original.changeCondition.ko,
              ...(original.changeCondition.triggerEvidenceIds === undefined
                ? {}
                : {
                    triggerEvidenceIds:
                      original.changeCondition.triggerEvidenceIds,
                  }),
            },
          }),
    });

    // When
    const changed = await persistStructuralAudit(options, {
      ...input,
      claims: [...input.claims, { ...first, claim: addedClaim }],
    });

    // Then
    expect(accepted.kind).toBe("persisted");
    expect(changed).toEqual({ kind: "blocked", reason: "claim_set_immutable" });
  });
});
