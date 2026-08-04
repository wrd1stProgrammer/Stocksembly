import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createOfficialAttemptHandler } from "../compositions/officialWorker";
import { ArtifactIdSchema, RunIdSchema } from "../domain/ids";
import { createLeaseEngine } from "../worker/leaseEngine";
import {
  CHALLENGE_ASSIGNMENTS,
  createSqliteChallengeRound,
} from "./challengeRound";
import {
  type ChallengeFault,
  stageAcceptedDepartments,
} from "./challengeRound.testSupport";
import { ChallengeDecisionSchema } from "./challengeRoundContracts";

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "challenge-round-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

describe("blind challenge round", () => {
  it("commits exactly four assigned blind material challenges with bounded follow-ups", async () => {
    // Given
    const prepared = await stageAcceptedDepartments(temporaryRoot(), "none");
    const round = createSqliteChallengeRound(prepared.options);

    // When
    const staged = await round.stage({
      runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
      consolidationArtifactIds: prepared.departmentReplay.artifactIds.map(
        (id) => ArtifactIdSchema.parse(id),
      ),
    });
    const replay = await round.drain(prepared.harness.input.mandate.runId);
    await round.close();

    // Then
    expect(staged.kind).toBe("staged");
    expect(replay.responseStartAllowed).toBe(true);
    expect(replay.receipts.map((receipt) => receipt.ordinal)).toEqual([
      16, 17, 18, 19,
    ]);
    expect(new Set(replay.receipts.map((item) => item.attemptId)).size).toBe(4);
    expect(new Set(replay.artifactIds).size).toBe(4);
    expect(replay.eventSequences).toHaveLength(4);
    expect(new Set(replay.committedChallengerIds)).toEqual(
      new Set(["market", "company", "financial", "risk"]),
    );
    expect(prepared.codex.challengeInputs).toHaveLength(4);
    expect(prepared.codex.maximumActive).toBe(3);
    expect(
      new Set(
        prepared.codex.challengeInputs.map(
          (input) =>
            `${input.assignment.challengerId}:${input.assignment.targetScope}`,
        ),
      ),
    ).toEqual(
      new Set(
        CHALLENGE_ASSIGNMENTS.map(
          ({ challengerId, targetScope }) => `${challengerId}:${targetScope}`,
        ),
      ),
    );
    for (const input of prepared.codex.challengeInputs) {
      expect(Object.keys(input.target).sort()).toEqual([
        "candidateCounterevidenceArtifactIds",
        "claimId",
        "evidenceArtifactIds",
        "materiality",
        "publicSummary",
      ]);
      expect(input.target.materiality).toBe("material");
      expect(
        input.target.candidateCounterevidenceArtifactIds.length,
      ).toBeGreaterThan(0);
      expect(input.sourceArtifactIds.length).toBeGreaterThanOrEqual(2);
      expect(input.sourceArtifacts).toHaveLength(3);
      expect(
        new Set(input.sourceArtifacts.map((item) => item.relation)),
      ).toEqual(
        new Set(["target_consolidation", "target_memo", "counter_memo"]),
      );
      expect(
        input.sourceArtifacts.every((item) => item.contentHash.length === 64),
      ).toBe(true);
      expect(
        JSON.stringify({
          sourceArtifacts: input.sourceArtifacts,
          target: input.target,
          counterpoint: input.counterpoint,
        }).match(
          /authorId|roleId|leadId|Maya|Ethan|Noah|Liam|마야|이든|노아|리암/,
        ),
      ).toBeNull();
    }
    const outputs = prepared.codex.challengeOutputs.map((output) =>
      ChallengeDecisionSchema.parse(output),
    );
    for (const output of outputs) {
      const input = prepared.codex.challengeInputs.find(
        (candidate) =>
          candidate.target.claimId === output.challengedClaimIds[0],
      );
      if (input === undefined) throw new TypeError("missing challenge input");
      expect(output.sourceArtifactIds).toEqual(input.sourceArtifactIds);
      expect(output.materiality).toBe(input.target.materiality);
      expect(
        output.evidenceArtifactIds.every((artifactId) =>
          input.target.candidateCounterevidenceArtifactIds.includes(artifactId),
        ),
      ).toBe(true);
      expect(Object.keys(output.followupRequest ?? {}).sort()).toEqual([
        "evidenceArtifactIds",
        "kind",
        "targetClaimId",
      ]);
    }
  });

  it("blocks a cross-run or unknown consolidation before any challenge launch", async () => {
    // Given
    const prepared = await stageAcceptedDepartments(temporaryRoot(), "none");
    const round = createSqliteChallengeRound(prepared.options);
    const ids = prepared.departmentReplay.artifactIds.map((id) =>
      ArtifactIdSchema.parse(id),
    );
    ids[0] = ArtifactIdSchema.parse("ffffffff-ffff-4fff-8fff-ffffffffffff");

    // When
    const result = await round.stage({
      runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
      consolidationArtifactIds: ids,
    });
    const replay = round.replay(prepared.harness.input.mandate.runId);
    await round.close();

    // Then
    expect(result).toEqual({
      kind: "blocked",
      reason: "cross_run_or_snapshot_consolidation",
    });
    expect(prepared.codex.challengeLaunches).toBe(0);
    expect(replay.responseStartAllowed).toBe(false);
    expect(replay.eventSequences).toHaveLength(0);
  });

  it("rejects an attempted fifth challenge before durable staging", async () => {
    // Given
    const prepared = await stageAcceptedDepartments(temporaryRoot(), "none");
    const round = createSqliteChallengeRound(prepared.options);
    const ids = prepared.departmentReplay.artifactIds.map((id) =>
      ArtifactIdSchema.parse(id),
    );
    const first = ids[0];
    if (first === undefined)
      throw new TypeError("missing consolidation fixture");

    // When
    const result = await round.stage({
      runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
      consolidationArtifactIds: [...ids, first],
    });
    const replay = round.replay(prepared.harness.input.mandate.runId);
    await round.close();

    // Then
    expect(result.kind).toBe("blocked");
    expect(prepared.codex.challengeLaunches).toBe(0);
    expect(replay.receipts).toHaveLength(0);
    expect(replay.eventSequences).toHaveLength(0);
  });

  it.each([
    "unknown_claim",
    "new_evidence",
    "qualitative_new_fact",
    "new_url",
    "omitted_parent",
    "impersonated_role",
    "arbitrary_browsing",
    "recursive_task",
  ] as const)(
    "rejects %s with one bounded replacement and no next-stage gate",
    async (fault: ChallengeFault) => {
      // Given
      const prepared = await stageAcceptedDepartments(temporaryRoot(), fault);
      const round = createSqliteChallengeRound(prepared.options);
      await round.stage({
        runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
        consolidationArtifactIds: prepared.departmentReplay.artifactIds.map(
          (id) => ArtifactIdSchema.parse(id),
        ),
      });

      // When
      const replay = await round.drain(prepared.harness.input.mandate.runId);
      await round.close();

      // Then
      expect(replay.responseStartAllowed).toBe(false);
      expect(replay.committedChallengerIds).not.toContain("market");
      expect(replay.artifactIds).toHaveLength(3);
      expect(replay.receipts).toHaveLength(5);
      expect(
        replay.receipts.filter((receipt) => receipt.challengerId === "market"),
      ).toHaveLength(2);
      expect(replay.eventSequences).toHaveLength(3);
    },
  );

  it("dispatches a challenge job through the official worker handler", async () => {
    // Given
    const root = temporaryRoot();
    const prepared = await stageAcceptedDepartments(root, "none");
    const staging = createSqliteChallengeRound(prepared.options);
    await staging.stage({
      runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
      consolidationArtifactIds: prepared.departmentReplay.artifactIds.map(
        (id) => ArtifactIdSchema.parse(id),
      ),
    });
    await staging.close();
    const official = await createOfficialAttemptHandler(
      {
        dataDirectory: root,
        databasePath: prepared.options.databasePath,
        ownerId: prepared.options.ownerId,
      },
      {
        cas: prepared.options.cas,
        codex: prepared.codex,
        now: prepared.options.now,
      },
    );
    const engine = createLeaseEngine({
      databasePath: prepared.options.databasePath,
      ownerId: prepared.options.ownerId,
      handler: official.handler,
      clock: { now: prepared.options.now },
    });

    // When
    const result = await engine.poll();
    await engine.shutdown();
    await official.close();
    const verification = createSqliteChallengeRound(prepared.options);
    const replay = verification.replay(prepared.harness.input.mandate.runId);
    await verification.close();

    // Then
    expect(result.kind).toBe("handled");
    expect(prepared.codex.challengeLaunches).toBe(1);
    expect(replay.artifactIds).toHaveLength(1);
    expect(replay.receipts[0]?.outcome).toBe("accepted");
  });
});
