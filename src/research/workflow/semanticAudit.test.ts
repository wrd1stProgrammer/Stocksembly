import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { makePersistableStructuralInput } from "../application/structuralAuditPersistence.testSupport";
import { StructuralAuditArtifactEnvelopeSchema } from "../application/structuralAuditPersistenceContracts";
import { hashCanonical } from "../domain/contractHelpers";
import { ArtifactIdSchema, QuestionIdSchema, RunIdSchema } from "../domain/ids";
import { ArtifactDigestSchema } from "../ports/artifacts";
import { sha256Value } from "../server/codex/codexArtifacts";
import { CODEX_RUNTIME_POLICY } from "../server/codex/codexPolicy";
import type {
  CodexRunInput,
  CodexRunResult,
} from "../server/codex/codexRunner";
import { CodexRunnerError } from "../server/codex/codexRunner";
import { createSqliteChallengeRound } from "./challengeRound";
import { stageAcceptedDepartments } from "./challengeRound.testSupport";
import { createSqliteFollowupAndResponseRound } from "./followupAndResponseRound";
import { FollowupResponseCodexFake } from "./followupAndResponseRound.testSupport";
import { createSqliteSemanticAudit } from "./semanticAudit";
import {
  SemanticAuditPromptSchema,
  SemanticAuditStageInputSchema,
} from "./semanticAuditContracts";
import {
  resealStructuralResult,
  rewriteStructuralEnvelope,
} from "./semanticAuditPersistence.testSupport";
import { persistStructuralAudit } from "./structuralAuditPersistence";
import { authenticatedWorkflowRetentionRegister } from "./structuralAuditWorkflowRegister";

const roots: string[] = [];

class SemanticCodexFake extends FollowupResponseCodexFake {
  semanticLaunches = 0;

  constructor(
    private readonly fault:
      | "none"
      | "always_crash"
      | "crash_first"
      | "always_lost"
      | "lost_first"
      | "always_uncertain"
      | "uncertain_first"
      | "invalid_first"
      | "always_invalid"
      | "duplicate"
      | "missing_verdict"
      | "wrong_evidence_reference"
      | "empty_evidence"
      | "empty_coverage"
      | "cited_but_non_entailing"
      | "contradicted"
      | "partial"
      | "not_assessable"
      | "uncovered" = "none",
  ) {
    super("none", { eligibleFollowups: 0 });
  }

  override async run<Candidate>(
    input: CodexRunInput<Candidate>,
  ): Promise<CodexRunResult<Candidate>> {
    if (input.stage !== "semantic_audit") return await super.run(input);
    this.semanticLaunches += 1;
    const firstLaunch = this.semanticLaunches === 1;
    if (
      this.fault === "always_crash" ||
      (this.fault === "crash_first" && firstLaunch)
    )
      throw new TypeError("simulated semantic verifier crash");
    if (
      this.fault === "always_lost" ||
      (this.fault === "lost_first" && firstLaunch)
    )
      throw new CodexRunnerError("timeout");
    if (
      this.fault === "always_uncertain" ||
      (this.fault === "uncertain_first" && firstLaunch)
    )
      throw new CodexRunnerError("process_failed");
    const request = z
      .object({
        claims: z.array(
          z.object({
            claimId: z.string().uuid(),
            evidence: z
              .array(z.object({ evidenceKey: z.string().min(1) }))
              .min(1),
          }),
        ),
        questions: z.array(z.object({ questionId: z.string().uuid() })),
      })
      .passthrough()
      .parse(JSON.parse(input.prompt));
    const effectiveFault =
      [
        "duplicate",
        "missing_verdict",
        "wrong_evidence_reference",
        "empty_evidence",
        "empty_coverage",
      ].includes(this.fault) && this.semanticLaunches > 1
        ? "none"
        : this.fault;
    const verdict =
      effectiveFault === "contradicted"
        ? "contradicted"
        : effectiveFault === "partial"
          ? "partial"
          : effectiveFault === "not_assessable" ||
              effectiveFault === "cited_but_non_entailing"
            ? "not_assessable"
            : "entailed";
    const raw =
      (this.fault === "invalid_first" && this.semanticLaunches === 1) ||
      this.fault === "always_invalid"
        ? {}
        : {
            kind: "semantic_audit",
            verdicts: request.claims.map((claim) => ({
              claimId: claim.claimId,
              verdict,
              contradictionSeverity:
                verdict === "contradicted"
                  ? "severe"
                  : verdict === "partial"
                    ? "limited"
                    : "none",
              publicExplanation: { en: "Entailed.", ko: "근거가 있습니다." },
            })),
            questionCoverage: request.questions.map((question) => ({
              questionId: question.questionId,
              status: effectiveFault === "uncovered" ? "uncovered" : "covered",
              claimIds:
                effectiveFault === "empty_coverage"
                  ? []
                  : request.claims.map((claim) => claim.claimId),
            })),
          };
    if (effectiveFault === "duplicate" && "verdicts" in raw) {
      const firstVerdict = raw.verdicts[0];
      if (firstVerdict !== undefined) raw.verdicts.push(firstVerdict);
    }
    if (effectiveFault === "missing_verdict" && "verdicts" in raw)
      raw.verdicts.splice(0);
    return {
      candidate: input.outputSchema.parse(raw),
      evidence: {
        ordinal: input.reservation.key.ordinal,
        stage: input.stage,
        model: CODEX_RUNTIME_POLICY.model,
        reasoning: CODEX_RUNTIME_POLICY.reasoningByStage[input.stage],
        browsingPolicy: CODEX_RUNTIME_POLICY.browsingByStage[input.stage],
        toolTranscriptHash: sha256Value([]),
        binaryVersion: "codex-cli 0.146.0-alpha.3.1",
        binaryHash:
          "fb2b6b35789e59c885cf4d2aee12475809dd67b2c10df580e638122fd6b3438e",
        originDevice: "1",
        originInode: "1",
        linkDevice: "1",
        linkInode: "1",
        profileHash: "a".repeat(64),
        environmentHash: "b".repeat(64),
        argvHash: "c".repeat(64),
        schemaHash: "d".repeat(64),
        eventTypes: ["thread.started", "item.completed", "turn.completed"],
        exitCode: 0,
        toolEventCount: 0,
        cleanup: "complete",
      },
    };
  }
}

afterEach(() => {
  for (;;) {
    const root = roots.pop();
    if (root === undefined) break;
    rmSync(root, { recursive: true, force: true });
  }
});

async function preparedRound(
  fault: ConstructorParameters<typeof SemanticCodexFake>[0] = "none",
  duplicateClaim = false,
) {
  const root = mkdtempSync(join(tmpdir(), "semantic-audit-"));
  roots.push(root);
  const codex = new SemanticCodexFake(fault);
  const prepared = await stageAcceptedDepartments(root, "none", codex);
  const challenges = createSqliteChallengeRound(prepared.options);
  await challenges.stage({
    runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
    consolidationArtifactIds: prepared.departmentReplay.artifactIds.map((id) =>
      ArtifactIdSchema.parse(id),
    ),
  });
  const challengeReplay = await challenges.drain(
    prepared.harness.input.mandate.runId,
  );
  await challenges.close();
  const responses = createSqliteFollowupAndResponseRound(prepared.options);
  await responses.stage({
    runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
    challengeArtifactIds: challengeReplay.artifactIds.map((id) =>
      ArtifactIdSchema.parse(id),
    ),
  });
  await responses.drain(prepared.harness.input.mandate.runId);
  await responses.close();
  const database = new Database(prepared.options.databasePath);
  const workflowReferences = z
    .array(
      z.object({
        artifactId: ArtifactIdSchema,
        logicalArtifactKey: z.string(),
        contentHash: ArtifactDigestSchema,
      }),
    )
    .parse(
      database
        .prepare(`SELECT agent_output_commits.artifact_id AS artifactId,
          attempts.logical_artifact_key AS logicalArtifactKey,
          artifacts.content_hash AS contentHash
        FROM agent_output_commits JOIN attempts USING (attempt_id)
        JOIN artifacts ON artifacts.artifact_id = agent_output_commits.artifact_id
        WHERE attempts.run_id = ? AND (
          attempts.logical_artifact_key LIKE 'memo:%' OR
          attempts.logical_artifact_key LIKE 'consolidation:%' OR
          attempts.logical_artifact_key LIKE 'challenge:%' OR
          attempts.logical_artifact_key LIKE 'response_ballot:%')
        ORDER BY attempts.logical_artifact_key`)
        .all(prepared.harness.input.mandate.runId),
    );
  database.close();
  const retention = await authenticatedWorkflowRetentionRegister(
    prepared.harness.cas,
    workflowReferences,
    prepared.harness.input.mandate.runId,
    prepared.harness.input.snapshot.snapshotId,
  );
  if (retention === undefined)
    throw new TypeError("workflow retention fixture is invalid");
  const baseStructuralInput = makePersistableStructuralInput(prepared.harness);
  const structuralInput = {
    ...baseStructuralInput,
    retainedDissentClaimIds: retention.dissentClaimIds,
    retainedOpenQuestionIds: retention.openQuestions.map(
      (question) => question.questionId,
    ),
    retainedOpenQuestions: retention.openQuestions,
  };
  const structuralAudit = await persistStructuralAudit(
    {
      databasePath: prepared.options.databasePath,
      cas: prepared.harness.cas,
      now: () => "2026-07-23T00:01:00.000Z",
    },
    structuralInput,
  );
  if (structuralAudit.kind !== "persisted")
    throw new TypeError(
      `structural audit fixture blocked: ${structuralAudit.reason}`,
    );
  const stored = await prepared.harness.cas.get(
    ArtifactDigestSchema.parse(structuralAudit.structuralAuditContentHash),
  );
  if (stored === undefined)
    throw new TypeError("persisted structural audit fixture is missing");
  let envelope = StructuralAuditArtifactEnvelopeSchema.parse(
    JSON.parse(new TextDecoder().decode(stored.bytes)),
  );
  if (!envelope.publishable)
    throw new TypeError(
      `structural audit fixture is not publishable: ${JSON.stringify(envelope.result.blockers)}`,
    );
  if (duplicateClaim) {
    const firstClaim = envelope.result.claims[0];
    const firstSlice = envelope.result.fixedEvidenceSlices[0];
    if (firstClaim === undefined || firstSlice === undefined)
      throw new TypeError("structural duplicate fixture is incomplete");
    const claims = [...envelope.result.claims, firstClaim];
    const claimSetHash = hashCanonical(
      claims.map((claim) => claim.claimHash).sort(),
    );
    const { auditHash: _auditHash, ...core } = envelope.result;
    const resealed = resealStructuralResult(envelope, {
      ...core,
      metrics: core.metrics.map((metric) =>
        metric.id === "open_question_retention"
          ? { ...metric, passed: metric.denominator }
          : metric,
      ),
      blockers: core.blockers.filter(
        (blocker) => blocker !== "open_question_retention",
      ),
      claims,
      claimSetHash,
      fixedEvidenceSlices: [...envelope.result.fixedEvidenceSlices, firstSlice],
      publishable: true,
    });
    envelope = {
      ...resealed,
      auditHash: resealed.result.auditHash,
      claimSetHash,
      publishable: true,
    };
    await rewriteStructuralEnvelope(
      {
        databasePath: prepared.options.databasePath,
        cas: prepared.harness.cas,
        structuralArtifactId: structuralAudit.structuralAuditArtifactId,
      },
      () => envelope,
    );
  }
  const questionIds = envelope.result.retainedOpenQuestions.map((question) =>
    QuestionIdSchema.parse(question.questionId),
  );
  return { root, codex, prepared, structuralAudit, envelope, questionIds };
}

async function stageAudit(
  audit: ReturnType<typeof createSqliteSemanticAudit>,
  runId: ReturnType<typeof RunIdSchema.parse>,
  structuralAuditArtifactId: string,
  questionIds: readonly ReturnType<typeof QuestionIdSchema.parse>[],
) {
  return await audit.stage({
    runId,
    structuralAuditArtifactId: ArtifactIdSchema.parse(
      structuralAuditArtifactId,
    ),
    questions: questionIds,
  });
}

describe("schema-bound semantic evidence verifier", () => {
  it("accepts an evidence audit with no fabricated workflow questions", () => {
    const prompt = SemanticAuditPromptSchema.safeParse({
      kind: "semantic_audit_input_v1",
      structuralAuditHash: "a".repeat(64),
      sourceArtifactIds: [],
      claims: [
        {
          claimId: "00000000-0000-4000-8000-000000000904",
          materiality: "material",
          text: { en: "Supported claim.", ko: "근거가 있는 주장입니다." },
          evidence: [
            {
              artifactId: "00000000-0000-4000-8000-000000000905",
              evidenceId: "filing:test",
              source: "sec_primary_filing",
              retrievedAt: "2026-01-20T00:01:00.000Z",
              availableAt: "2026-01-20T00:01:00.000Z",
              locatorHash: "b".repeat(64),
              span: {
                start: 0,
                end: 8,
                textHash:
                  "ee8250fb76e094b34b471f13a73dbbe51d1ae142e9df59d7c0d31ec20f0a0a8e",
              },
              exactText: "evidence",
              relation: "supporting",
            },
          ],
        },
      ],
      questions: [],
    });
    const stage = SemanticAuditStageInputSchema.safeParse({
      runId: "00000000-0000-4000-8000-000000000901",
      structuralAuditArtifactId: "00000000-0000-4000-8000-000000000902",
      questions: [],
    });

    expect(prompt.success).toBe(true);
    expect(stage.success).toBe(true);
  });

  it("stages one semantic claim when a structural artifact repeats the same claim id", async () => {
    // Given
    const { prepared, structuralAudit, envelope, questionIds } =
      await preparedRound("none", true);
    expect(envelope.publishable, JSON.stringify(envelope.result.blockers)).toBe(
      true,
    );
    const audit = createSqliteSemanticAudit(prepared.options);

    // When
    const staged = await stageAudit(
      audit,
      RunIdSchema.parse(prepared.harness.input.mandate.runId),
      structuralAudit.structuralAuditArtifactId,
      questionIds,
    );
    await audit.close();

    // Then
    expect(staged).toEqual({ kind: "staged" });
  });

  it("commits exactly one non-character artifact and freezes semantic dispositions", async () => {
    // Given
    const { codex, prepared, structuralAudit, questionIds } =
      await preparedRound();
    const audit = createSqliteSemanticAudit(prepared.options);
    const claimId = "00000000-0000-4000-8000-000000000904";

    // When
    const staged = await stageAudit(
      audit,
      RunIdSchema.parse(prepared.harness.input.mandate.runId),
      structuralAudit.structuralAuditArtifactId,
      questionIds,
    );
    const replay = await audit.drain(prepared.harness.input.mandate.runId);
    await audit.close();

    // Then
    expect(staged.kind, JSON.stringify(staged)).toBe("staged");
    expect(replay.artifactIds).toHaveLength(1);
    expect(replay.receipts).toEqual([
      expect.objectContaining({ ordinal: 24, outcome: "accepted" }),
    ]);
    expect(replay.claims).toEqual([
      { claimId, disposition: "verified", verdict: "entailed" },
    ]);
    expect(replay.questionCoverage).toEqual(
      questionIds.map((questionId) => ({ questionId, status: "covered" })),
    );
    expect(replay.publishable).toBe(true);
    expect(replay.characterActorId).toBeNull();
    expect(codex.semanticLaunches).toBe(1);
  });

  it.each(["invalid_first"] as const)(
    "burns a %s ordinal and allows only one new-ordinal replacement",
    async (fault) => {
      // Given
      const { codex, prepared, structuralAudit, questionIds } =
        await preparedRound(fault);
      const audit = createSqliteSemanticAudit(prepared.options);
      await stageAudit(
        audit,
        RunIdSchema.parse(prepared.harness.input.mandate.runId),
        structuralAudit.structuralAuditArtifactId,
        questionIds,
      );

      // When
      const replay = await audit.drain(prepared.harness.input.mandate.runId);
      await audit.close();

      // Then
      expect(
        replay.receipts.map((receipt) => [receipt.ordinal, receipt.outcome]),
        JSON.stringify({ replay, semanticLaunches: codex.semanticLaunches }),
      ).toEqual([
        [24, "invalid_schema"],
        [25, "accepted"],
      ]);
      expect(
        new Set(replay.receipts.map((receipt) => receipt.ordinal)).size,
      ).toBe(2);
      expect(
        replay.receipts.map((receipt) => receipt.evidenceRecorded),
      ).toEqual([false, true]);
      expect(replay.artifactIds).toHaveLength(1);
      expect(codex.semanticLaunches).toBe(2);
    },
  );

  it.each(["missing_verdict"] as const)(
    "replaces a %s verifier result without accepting it",
    async (fault) => {
      // Given
      const { codex, prepared, structuralAudit, questionIds } =
        await preparedRound(fault);
      const audit = createSqliteSemanticAudit(prepared.options);
      await stageAudit(
        audit,
        RunIdSchema.parse(prepared.harness.input.mandate.runId),
        structuralAudit.structuralAuditArtifactId,
        questionIds,
      );

      // When
      const replay = await audit.drain(prepared.harness.input.mandate.runId);
      await audit.close();

      // Then
      expect(
        replay.receipts.map((receipt) => receipt.ordinal),
        JSON.stringify({ replay, semanticLaunches: codex.semanticLaunches }),
      ).toEqual([24, 25]);
      expect(replay.artifactIds).toHaveLength(1);
      expect(codex.semanticLaunches).toBe(2);
    },
  );

  it.each(["duplicate", "wrong_evidence_reference", "empty_coverage"] as const)(
    "sanitizes a %s verifier result against the trusted prompt",
    async (fault) => {
      const { codex, prepared, structuralAudit, questionIds } =
        await preparedRound(fault);
      const audit = createSqliteSemanticAudit(prepared.options);
      await stageAudit(
        audit,
        RunIdSchema.parse(prepared.harness.input.mandate.runId),
        structuralAudit.structuralAuditArtifactId,
        questionIds,
      );

      const replay = await audit.drain(prepared.harness.input.mandate.runId);
      await audit.close();

      expect(replay.receipts.map((receipt) => receipt.ordinal)).toEqual([24]);
      expect(replay.artifactIds).toHaveLength(1);
      expect(codex.semanticLaunches).toBe(1);
    },
  );

  it("blocks publication when a material audit is contradicted", async () => {
    // Given
    const { prepared, structuralAudit, questionIds } =
      await preparedRound("contradicted");
    const audit = createSqliteSemanticAudit(prepared.options);
    await stageAudit(
      audit,
      RunIdSchema.parse(prepared.harness.input.mandate.runId),
      structuralAudit.structuralAuditArtifactId,
      questionIds,
    );

    // When
    const replay = await audit.drain(prepared.harness.input.mandate.runId);
    await audit.close();

    // Then
    expect(replay.publishable).toBe(false);
    expect(replay).not.toHaveProperty("score");
    expect(replay.characterActorId).toBeNull();
  });

  it("does not manufacture uncovered coverage when no actionable question exists", async () => {
    const { prepared, structuralAudit, questionIds } =
      await preparedRound("uncovered");
    const audit = createSqliteSemanticAudit(prepared.options);
    await stageAudit(
      audit,
      RunIdSchema.parse(prepared.harness.input.mandate.runId),
      structuralAudit.structuralAuditArtifactId,
      questionIds,
    );

    const replay = await audit.drain(prepared.harness.input.mandate.runId);
    await audit.close();

    expect(replay.publishable).toBe(true);
    expect(replay.questionCoverage).toEqual([]);
  });

  it.each(["partial", "not_assessable", "cited_but_non_entailing"] as const)(
    "publishes with explicit limitations when a material audit is %s",
    async (fault) => {
      // Given
      const { prepared, structuralAudit, questionIds } =
        await preparedRound(fault);
      const audit = createSqliteSemanticAudit(prepared.options);
      await stageAudit(
        audit,
        RunIdSchema.parse(prepared.harness.input.mandate.runId),
        structuralAudit.structuralAuditArtifactId,
        questionIds,
      );

      // When
      const replay = await audit.drain(prepared.harness.input.mandate.runId);
      await audit.close();

      // Then
      expect(replay.publishable).toBe(true);
      expect(replay).not.toHaveProperty("score");
      expect(replay.characterActorId).toBeNull();
    },
  );

  it("freezes a staged structural artifact and refuses changed questions", async () => {
    // Given
    const { prepared, structuralAudit, questionIds } = await preparedRound();
    const audit = createSqliteSemanticAudit(prepared.options);
    const runId = RunIdSchema.parse(prepared.harness.input.mandate.runId);

    // When
    const first = await stageAudit(
      audit,
      runId,
      structuralAudit.structuralAuditArtifactId,
      questionIds,
    );
    const replay = audit.replay(runId);
    const same = await stageAudit(
      audit,
      runId,
      structuralAudit.structuralAuditArtifactId,
      questionIds,
    );
    const changed = await audit.stage({
      runId,
      structuralAuditArtifactId: ArtifactIdSchema.parse(
        structuralAudit.structuralAuditArtifactId,
      ),
      questions: [
        QuestionIdSchema.parse("77777777-7777-4777-8777-777777777777"),
      ],
    });
    await audit.close();

    // Then
    expect(first.kind, JSON.stringify(first)).toBe("staged");
    expect(same.kind).toBe("staged");
    expect(replay.artifactIds).toHaveLength(0);
    expect(changed).toEqual({
      kind: "blocked",
      reason: "claim_set_mismatch",
    });
  });

  it.each(["always_invalid"] as const)(
    "stops after the shared replacement when the semantic runner is %s",
    async (fault) => {
      // Given
      const { codex, prepared, structuralAudit, questionIds } =
        await preparedRound(fault);
      const audit = createSqliteSemanticAudit(prepared.options);
      await stageAudit(
        audit,
        RunIdSchema.parse(prepared.harness.input.mandate.runId),
        structuralAudit.structuralAuditArtifactId,
        questionIds,
      );

      // When
      const replay = await audit.drain(prepared.harness.input.mandate.runId);
      await audit.close();

      // Then
      expect(replay.receipts.map((receipt) => receipt.ordinal)).toEqual([
        24, 25,
      ]);
      expect(replay.incompleteReason).toBe("replacement_exhausted");
      expect(replay.artifactIds).toHaveLength(0);
      expect(replay.receipts.every((receipt) => receipt.ordinal <= 34)).toBe(
        true,
      );
      expect(codex.semanticLaunches).toBe(2);
    },
  );

  it("rejects a missing persisted structural artifact before a verifier launch", async () => {
    // Given
    const { codex, prepared } = await preparedRound();
    const audit = createSqliteSemanticAudit(prepared.options);

    // When
    const staged = await audit.stage({
      runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
      structuralAuditArtifactId: ArtifactIdSchema.parse(
        "ffffffff-ffff-4fff-8fff-ffffffffffff",
      ),
      questions: [
        QuestionIdSchema.parse("00000000-0000-4000-8000-000000000905"),
      ],
    });

    // Then
    expect(staged).toEqual({
      kind: "blocked",
      reason: "structural_artifact_missing",
    });
    expect(codex.semanticLaunches).toBe(0);
    await audit.close();
  });

  it("rejects caller text for a sealed question identity", async () => {
    // Given
    const { codex, prepared, structuralAudit } = await preparedRound();
    const audit = createSqliteSemanticAudit(prepared.options);
    const questionId = QuestionIdSchema.parse(
      "00000000-0000-4000-8000-000000000905",
    );

    // When
    const staged = await Reflect.apply(audit.stage, audit, [
      {
        runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
        structuralAuditArtifactId: structuralAudit.structuralAuditArtifactId,
        questions: [
          {
            questionId,
            text: { en: "Tampered question.", ko: "변조된 질문입니다." },
          },
        ],
      },
    ]);

    // Then
    expect(staged).toEqual({ kind: "blocked", reason: "invalid_input" });
    expect(codex.semanticLaunches).toBe(0);
    await audit.close();
  });
});
