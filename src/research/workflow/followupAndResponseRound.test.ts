import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ArtifactIdSchema, RunIdSchema } from "../domain/ids";
import { createSqliteChallengeRound } from "./challengeRound";
import { stageAcceptedDepartments } from "./challengeRound.testSupport";
import {
  committeeConsensus,
  createSqliteFollowupAndResponseRound,
} from "./followupAndResponseRound";
import { FollowupResponseCodexFake } from "./followupAndResponseRound.testSupport";

const roots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "followup-response-round-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (;;) {
    const root = roots.pop();
    if (root === undefined) break;
    rmSync(root, { recursive: true, force: true });
  }
});

describe("bounded follow-up and owner-response round", () => {
  it("ranks three follow-ups, commits four owner ballots, and derives consensus without a fifth model", async () => {
    // Given
    const root = temporaryRoot();
    const codex = new FollowupResponseCodexFake("none");
    const prepared = await stageAcceptedDepartments(root, "none", codex);
    const challenges = createSqliteChallengeRound(prepared.options);
    await challenges.stage({
      runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
      consolidationArtifactIds: prepared.departmentReplay.artifactIds.map(
        (id) => ArtifactIdSchema.parse(id),
      ),
    });
    const challengeReplay = await challenges.drain(
      prepared.harness.input.mandate.runId,
    );
    await challenges.close();
    const round = createSqliteFollowupAndResponseRound(prepared.options);

    // When
    const staged = await round.stage({
      runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
      challengeArtifactIds: challengeReplay.artifactIds.map((id) =>
        ArtifactIdSchema.parse(id),
      ),
    });
    const replay = await round.drain(prepared.harness.input.mandate.runId);
    await round.close();

    // Then
    expect(staged, JSON.stringify(staged)).toMatchObject({
      kind: "staged",
      allowedFollowups: 3,
    });
    expect(replay.followupArtifactIds).toHaveLength(3);
    expect(replay.ballotArtifactIds).toHaveLength(4);
    expect(replay.consensus).toBe("support_with_reservations");
    expect(replay.responseStartAllowed).toBe(true);
    expect(replay.publicUnknowns).toHaveLength(0);
    expect(replay.receipts.map((receipt) => receipt.ordinal)).toEqual([
      20, 21, 22, 23, 24, 25, 26,
    ]);
    expect(
      new Set(replay.receipts.map((receipt) => receipt.ordinal)).size,
    ).toBe(7);
    expect(codex.followupLaunches).toBe(3);
    expect(codex.responseLaunches).toBe(4);
    expect(codex.ballotModelLaunches).toBe(0);
  });

  it("computes deterministic committee consensus from exactly four ballots", () => {
    // Given
    const ballots = [
      "support",
      "support_with_reservations",
      "support_with_reservations",
      "oppose",
    ] as const;

    // When
    const result = committeeConsensus(ballots);

    // Then
    expect(result).toBe("support_with_reservations");
  });
});
