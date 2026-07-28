import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createOfficialAttemptHandler } from "../compositions/officialWorker";
import { ArtifactIdSchema, RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import type {
  ArtifactCasPort,
  ArtifactDescriptor,
  ArtifactDigest,
  ArtifactWrite,
} from "../ports/artifacts";
import { ArtifactDigestSchema } from "../ports/artifacts";
import { createLeaseEngine } from "../worker/leaseEngine";
import { createSqliteChallengeRound } from "./challengeRound";
import { stageAcceptedDepartments } from "./challengeRound.testSupport";
import {
  createSqliteFollowupAndResponseRound,
  followupAllowance,
} from "./followupAndResponseRound";
import { FollowupResponseCodexFake } from "./followupAndResponseRound.testSupport";
import { compareFollowupPriority } from "./followupAndResponseRoundInput";

const roots: string[] = [];
type CasFault = "artifact" | "run" | "snapshot" | "digest" | "bytes";

class TamperingCas implements ArtifactCasPort {
  #tampered = false;
  constructor(
    private readonly delegate: ArtifactCasPort,
    private readonly fault: CasFault,
  ) {}
  put(input: ArtifactWrite): Promise<ArtifactDescriptor> {
    return this.delegate.put(input);
  }
  has(digest: ArtifactDigest): Promise<boolean> {
    return this.delegate.has(digest);
  }
  async get(digest: ArtifactDigest) {
    const read = await this.delegate.get(digest);
    if (read === undefined || this.#tampered) return read;
    this.#tampered = true;
    if (this.fault === "bytes")
      return {
        descriptor: read.descriptor,
        bytes: new Uint8Array([0, ...read.bytes]),
      };
    return {
      descriptor: {
        ...read.descriptor,
        ...(this.fault === "artifact"
          ? {
              artifactId: ArtifactIdSchema.parse(
                "ffffffff-ffff-4fff-8fff-ffffffffffff",
              ),
            }
          : {}),
        ...(this.fault === "run"
          ? { runId: RunIdSchema.parse("ffffffff-ffff-4fff-8fff-ffffffffffff") }
          : {}),
        ...(this.fault === "snapshot"
          ? {
              snapshotId: SnapshotIdSchema.parse(
                "ffffffff-ffff-4fff-8fff-ffffffffffff",
              ),
            }
          : {}),
        ...(this.fault === "digest"
          ? { digest: ArtifactDigestSchema.parse("f".repeat(64)) }
          : {}),
      },
      bytes: read.bytes,
    };
  }
}
const temporaryRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "followup-response-corrective-"));
  roots.push(root);
  return root;
};
afterEach(() => {
  for (;;) {
    const root = roots.pop();
    if (root === undefined) break;
    rmSync(root, { recursive: true, force: true });
  }
});

async function stagedRound(
  eligibleFollowups: number,
  options: ConstructorParameters<typeof FollowupResponseCodexFake>[1] = {},
  casFault?: CasFault,
) {
  const fixture = await preparedChallenges(eligibleFollowups, options);
  const { root, codex, prepared, challengeReplay } = fixture;
  const round = createSqliteFollowupAndResponseRound({
    ...prepared.options,
    cas:
      casFault === undefined
        ? prepared.options.cas
        : new TamperingCas(prepared.options.cas, casFault),
  });
  const stage = await round.stage({
    runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
    challengeArtifactIds: challengeReplay.artifactIds.map((id) =>
      ArtifactIdSchema.parse(id),
    ),
  });
  return { root, codex, prepared, challengeReplay, round, stage };
}

async function preparedChallenges(
  eligibleFollowups: number,
  options: ConstructorParameters<typeof FollowupResponseCodexFake>[1] = {},
) {
  const root = temporaryRoot();
  const codex = new FollowupResponseCodexFake("none", {
    eligibleFollowups,
    ...options,
  });
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
  return { root, codex, prepared, challengeReplay };
}

function persistReplacementHistory(
  databasePath: string,
  runId: string,
  count: number,
): void {
  const database = new Database(databasePath);
  const baseAttempts = database
    .prepare(`SELECT attempt_id, job_id, snapshot_id, logical_artifact_key,
      input_hash, input_manifest_hash FROM attempts WHERE run_id = ?
      AND replacement_of_attempt_id IS NULL ORDER BY created_at, attempt_id LIMIT ?`)
    .all(runId, count);
  const insert =
    database.prepare(`INSERT INTO attempts(attempt_id, job_id, run_id,
    snapshot_id, kind, status, logical_artifact_key, input_hash,
    input_manifest_hash, replacement_of_attempt_id, created_at, outcome)
    VALUES (@attemptId, @jobId, @runId, @snapshotId, 'research', 'failed',
      @logicalArtifactKey, @inputHash, @inputManifestHash,
      @replacementOfAttemptId, '2026-07-23T00:00:01.000Z', 'failed')`);
  for (const value of baseAttempts) {
    const row = z
      .object({
        attempt_id: z.string().uuid(),
        job_id: z.string().uuid(),
        snapshot_id: z.string().uuid(),
        logical_artifact_key: z.string(),
        input_hash: z.string(),
        input_manifest_hash: z.string(),
      })
      .parse(value);
    insert.run({
      attemptId: randomUUID(),
      jobId: row.job_id,
      runId,
      snapshotId: row.snapshot_id,
      logicalArtifactKey: row.logical_artifact_key,
      inputHash: row.input_hash,
      inputManifestHash: row.input_manifest_hash,
      replacementOfAttemptId: row.attempt_id,
    });
  }
  database.close();
}

describe("follow-up and response corrective boundaries", () => {
  it("ranks materiality before unresolved impact and evidence availability", () => {
    // Given
    const material = {
      materiality: "material" as const,
      contradiction: "partial" as const,
      evidenceArtifactIds: ["one"],
      targetDepartmentId: "risk" as const,
    };
    const supporting = {
      materiality: "supporting" as const,
      contradiction: "direct" as const,
      evidenceArtifactIds: ["one", "two", "three"],
      targetDepartmentId: "market" as const,
    };

    // When
    const result = [supporting, material].sort(compareFollowupPriority);

    // Then
    expect(result).toEqual([material, supporting]);
  });

  it("uses the locked replacement formula and fails closed after five replacements", () => {
    // Given / When / Then
    expect(
      [0, 4, 5].map((used) => [followupAllowance(used), 26 + used + 3]),
    ).toEqual([
      [3, 29],
      [3, 33],
      [3, 34],
    ]);
    expect(followupAllowance(6)).toBe("incomplete");
  });

  it.each([
    [0, 29],
    [2, 31],
    [5, 34],
  ] as const)(
    "projects %i persisted replacements to exactly %i physical launches",
    async (replacements, projected) => {
      // Given
      const fixture = await preparedChallenges(4);
      persistReplacementHistory(
        fixture.prepared.options.databasePath,
        fixture.prepared.harness.input.mandate.runId,
        replacements,
      );
      const round = createSqliteFollowupAndResponseRound(
        fixture.prepared.options,
      );

      // When
      const stage = await round.stage({
        runId: RunIdSchema.parse(fixture.prepared.harness.input.mandate.runId),
        challengeArtifactIds: fixture.challengeReplay.artifactIds.map((id) =>
          ArtifactIdSchema.parse(id),
        ),
      });
      await round.close();

      // Then
      expect(stage).toMatchObject({
        kind: "staged",
        allowedFollowups: 3,
        selectedFollowups: 3,
        projectedPhysicalLaunches: projected,
      });
    },
  );

  it.each([0, 1, 2, 3])(
    "schedules exactly %i eligible one-role follow-ups without inventing unknowns for null requests",
    async (eligible) => {
      // Given
      const fixture = await stagedRound(eligible);

      // When
      const replay = await fixture.round.drain(
        fixture.prepared.harness.input.mandate.runId,
      );
      await fixture.round.close();

      // Then
      expect(fixture.stage).toMatchObject({
        kind: "staged",
        selectedFollowups: eligible,
        projectedPhysicalLaunches: 26 + eligible,
      });
      expect(replay.followupArtifactIds).toHaveLength(eligible);
      expect(replay.ballotArtifactIds).toHaveLength(4);
      expect(replay.publicUnknowns).toHaveLength(0);
      expect(fixture.codex.followupLaunches).toBe(eligible);
      expect(fixture.codex.responseLaunches).toBe(4);
      expect(fixture.codex.ballotModelLaunches).toBe(0);
      expect(new Set(replay.receipts.map((item) => item.ordinal)).size).toBe(
        replay.receipts.length,
      );
    },
  );

  it("starts independent owner ballots while an optional follow-up is pending", async () => {
    const fixture = await stagedRound(1);
    const runId = fixture.prepared.harness.input.mandate.runId;

    await fixture.round.advance(runId);
    const database = new Database(fixture.prepared.options.databasePath, {
      readonly: true,
    });
    const counts = z
      .object({ followups: z.number(), ballots: z.number() })
      .parse(
        database
          .prepare(`SELECT
            SUM(CASE WHEN logical_key LIKE 'followup:%' THEN 1 ELSE 0 END) AS followups,
            SUM(CASE WHEN logical_key LIKE 'response_ballot:%' THEN 1 ELSE 0 END) AS ballots
          FROM jobs WHERE run_id = ? AND (
            logical_key LIKE 'followup:%' OR logical_key LIKE 'response_ballot:%'
          )`)
          .get(runId),
      );
    database.close();
    await fixture.round.close();

    expect(counts).toEqual({ followups: 1, ballots: 3 });
  });

  it("limits every owner prompt to its committed challenge, member memos, and allowed follow-up", async () => {
    // Given
    const fixture = await stagedRound(3);
    const consolidationIds = new Set(
      fixture.prepared.departmentReplay.artifactIds,
    );

    // When
    await fixture.round.drain(fixture.prepared.harness.input.mandate.runId);
    await fixture.round.close();

    // Then
    expect(fixture.codex.responseInputs).toHaveLength(4);
    expect(fixture.codex.responseOutputs).toHaveLength(4);
    for (const input of fixture.codex.responseInputs) {
      expect(input.targetClaimIds).toHaveLength(1);
      expect(new Set(input.sourceArtifactIds).size).toBe(
        input.sourceArtifactIds.length,
      );
      expect(
        input.sourceArtifactIds.some((id) => consolidationIds.has(id)),
      ).toBe(false);
    }
    expect(
      fixture.codex.responseOutputs.flatMap((output) =>
        output.dispositions.map((item) => item.disposition),
      ),
    ).toEqual(["revise", "revise", "revise", "revise"]);
    expect(
      fixture.codex.responseOutputs.map((output) => output.ballot.vote),
    ).toEqual([
      "support_with_reservations",
      "support_with_reservations",
      "support_with_reservations",
      "support_with_reservations",
    ]);
  });

  it("rejects a stale or cross-run challenge set before any optional launch", async () => {
    // Given
    const fixture = await stagedRound(0);
    await fixture.round.close();
    const round = createSqliteFollowupAndResponseRound(
      fixture.prepared.options,
    );
    const ids = fixture.challengeReplay.artifactIds.map((id) =>
      ArtifactIdSchema.parse(id),
    );
    ids[0] = ArtifactIdSchema.parse("ffffffff-ffff-4fff-8fff-ffffffffffff");

    // When
    const result = await round.stage({
      runId: RunIdSchema.parse(fixture.prepared.harness.input.mandate.runId),
      challengeArtifactIds: ids,
    });
    await round.close();

    // Then
    expect(result).toEqual({
      kind: "blocked",
      reason: "cross_run_or_snapshot_challenge",
    });
    expect(fixture.codex.followupLaunches).toBe(0);
  });

  it.each(["artifact", "run", "snapshot", "digest", "bytes"] as const)(
    "rejects authenticated CAS %s tampering before any optional launch",
    async (fault) => {
      // Given / When
      const fixture = await stagedRound(3, {}, fault);

      // Then
      expect(fixture.stage).toEqual({
        kind: "blocked",
        reason: "challenge_artifact_authentication_failed",
      });
      expect(fixture.codex.followupLaunches).toBe(0);
      await fixture.round.close();
    },
  );

  it("resumes from durable staged jobs after the round facade is reopened", async () => {
    // Given
    const fixture = await stagedRound(2);
    await fixture.round.close();
    const resumed = createSqliteFollowupAndResponseRound(
      fixture.prepared.options,
    );

    // When
    const replay = await resumed.drain(
      fixture.prepared.harness.input.mandate.runId,
    );
    await resumed.close();

    // Then
    expect(replay.followupArtifactIds).toHaveLength(2);
    expect(replay.ballotArtifactIds).toHaveLength(4);
    expect(replay.publicUnknowns).toHaveLength(0);
    expect(replay.consensus).toBe("support_with_reservations");
  });

  it("fails closed when drain is called before a durable follow-up plan is staged", async () => {
    // Given
    const fixture = await preparedChallenges(3);
    const round = createSqliteFollowupAndResponseRound(
      fixture.prepared.options,
    );

    // When
    const replay = await round.drain(
      fixture.prepared.harness.input.mandate.runId,
    );
    await round.close();

    // Then
    expect(replay.followupArtifactIds).toHaveLength(0);
    expect(replay.ballotArtifactIds).toHaveLength(0);
    expect(replay.consensus).toBe("incomplete");
    expect(replay.drainState).toBe("incomplete");
    expect(replay.incompleteReason).toBe("plan_not_staged");
    expect(fixture.codex.followupLaunches).toBe(0);
    expect(fixture.codex.responseLaunches).toBe(0);
  });

  it("never replaces an invalid optional follow-up or promotes it to a public unknown", async () => {
    // Given
    const fixture = await stagedRound(4, { invalidFollowup: true });

    // When
    const replay = await fixture.round.drain(
      fixture.prepared.harness.input.mandate.runId,
    );
    await fixture.round.close();

    // Then
    expect(fixture.codex.followupLaunches).toBe(3);
    expect(replay.followupArtifactIds).toHaveLength(0);
    expect(
      replay.receipts.filter((item) =>
        item.logicalArtifactId.startsWith("followup:"),
      ),
    ).toHaveLength(3);
    expect(replay.publicUnknowns).toHaveLength(0);
    expect(replay.ballotArtifactIds).toHaveLength(4);
  });

  it("stops after a second invalid required ballot without launch 35 or consensus", async () => {
    // Given
    const fixture = await stagedRound(4, { invalidBallotDepartment: "market" });

    // When
    const replay = await fixture.round.drain(
      fixture.prepared.harness.input.mandate.runId,
    );
    await fixture.round.close();

    // Then
    expect(fixture.codex.responseLaunches).toBe(5);
    expect(replay.ballotArtifactIds).toHaveLength(3);
    expect(replay.consensus).toBe("incomplete");
    expect(
      Math.max(...replay.receipts.map((item) => item.ordinal)),
    ).toBeLessThan(35);
    expect(
      replay.receipts.filter(
        (item) => item.logicalArtifactId === "response_ballot:market",
      ),
    ).toHaveLength(2);
  });

  it("dispatches a persisted optional job through the real official worker composition", async () => {
    // Given
    const fixture = await stagedRound(1);
    const official = await createOfficialAttemptHandler(
      {
        dataDirectory: fixture.root,
        databasePath: fixture.prepared.options.databasePath,
        ownerId: fixture.prepared.options.ownerId,
      },
      {
        cas: fixture.prepared.options.cas,
        codex: fixture.codex,
        now: fixture.prepared.options.now,
      },
    );
    const engine = createLeaseEngine({
      databasePath: fixture.prepared.options.databasePath,
      ownerId: fixture.prepared.options.ownerId,
      handler: official.handler,
      clock: { now: fixture.prepared.options.now },
    });

    // When
    const handled = await engine.poll();
    await engine.shutdown();
    await official.close();
    const replay = fixture.round.replay(
      fixture.prepared.harness.input.mandate.runId,
    );
    await fixture.round.close();

    // Then
    expect(handled.kind).toBe("handled");
    expect(replay.followupArtifactIds).toHaveLength(1);
    expect(replay.receipts[0]?.outcome).toBe("accepted");
  });
});
