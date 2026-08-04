import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { DepartmentConsolidationOutputSchema } from "../domain/agentOutputs";
import { ArtifactIdSchema, RunIdSchema } from "../domain/ids";
import { WORKFLOW_V1_ROLE_REGISTRY } from "../domain/roleRegistry";
import { createSqliteDepartmentRound } from "./departmentRound";
import { stageAcceptedSpecialists } from "./departmentRound.testSupport";

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "department-round-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

describe("department round", () => {
  it("commits four distinct lead meetings from exact authenticated member sets while retaining dissent and unknowns", async () => {
    // Given
    const prepared = await stageAcceptedSpecialists(temporaryRoot(), "none");
    const round = createSqliteDepartmentRound(prepared.options);
    const accepted = round.acceptedMemos(prepared.harness.input.mandate.runId);

    // When
    const staged = await round.stage({
      runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
      memberArtifactIds: accepted.map((memo) => memo.artifactId),
    });
    const replay = await round.drain(prepared.harness.input.mandate.runId);
    await round.close();

    // Then
    expect(staged.kind).toBe("staged");
    expect(replay.challengeStartAllowed).toBe(true);
    expect(replay.receipts).toHaveLength(4);
    expect(replay.receipts.map((receipt) => receipt.ordinal)).toEqual([
      12, 13, 14, 15,
    ]);
    expect(new Set(replay.receipts.map((item) => item.attemptId)).size).toBe(4);
    expect(replay.artifactIds).toHaveLength(4);
    expect(replay.eventSequences).toHaveLength(4);
    expect(new Set(replay.committedDepartmentIds)).toEqual(
      new Set(["market", "company", "financial", "risk"]),
    );
    expect(prepared.codex.departmentInputs).toHaveLength(4);
    expect(prepared.codex.maximumActive).toBe(3);
    for (const request of prepared.codex.departmentInputs) {
      const expected =
        WORKFLOW_V1_ROLE_REGISTRY.departments[request.department.id];
      expect(request.department.leadId).toBe(expected.leadId);
      expect(
        request.memberArtifacts.map((item) => item.ownership.roleId),
      ).toEqual(expected.memberIds);
      expect(
        request.memberArtifacts.every(
          (member) =>
            member.contentHash.length === 64 &&
            member.memo.positions.every(
              (claim) => !("roleId" in claim) && !("authorId" in claim),
            ),
        ),
      ).toBe(true);
      for (const member of request.memberArtifacts) {
        const metadata = accepted.find(
          (memo) => memo.artifactId === member.artifactId,
        );
        expect(member.contentHash).toBe(metadata?.contentHash);
        expect(metadata?.snapshotId).toBe(prepared.replay.snapshotId);
      }
    }
    const outputs = prepared.codex.departmentOutputs.map((output) =>
      DepartmentConsolidationOutputSchema.parse(output),
    );
    expect(outputs.some((output) => output.dissent.length > 0)).toBe(true);
    expect(outputs.every((output) => output.openQuestions.length > 0)).toBe(
      true,
    );
    expect(
      outputs.every(
        (output) =>
          output.strongestClaimIds.length > 0 &&
          output.weakestClaimIds.length > 0 &&
          output.evidencePriorityArtifactIds.length > 0,
      ),
    ).toBe(true);
    for (const [index, output] of outputs.entries()) {
      const request = prepared.codex.departmentInputs[index];
      if (request === undefined) throw new TypeError("missing request fixture");
      const claimIds = new Set(
        request.memberArtifacts.flatMap((member) =>
          member.memo.positions.map((position) => position.claimId),
        ),
      );
      const evidenceIds = new Set(
        request.memberArtifacts.flatMap((member) =>
          member.memo.positions.flatMap(
            (position) => position.evidenceArtifactIds,
          ),
        ),
      );
      expect(
        [
          ...output.agreementClaimIds,
          ...output.disagreementClaimIds,
          ...output.acceptedClaimIds,
          ...output.revisedClaimIds,
          ...output.removedClaimIds,
        ].every((claimId) => claimIds.has(claimId)),
      ).toBe(true);
      expect(
        output.evidencePriorityArtifactIds.every((artifactId) =>
          evidenceIds.has(artifactId),
        ),
      ).toBe(true);
    }
  });

  it("stages every ready department while Aria's company memo is pending", async () => {
    // Given
    const prepared = await stageAcceptedSpecialists(temporaryRoot(), "none");
    const database = new Database(prepared.options.databasePath);
    database
      .prepare(`DELETE FROM agent_output_commits WHERE attempt_id = (
        SELECT attempt_id FROM attempts
        WHERE run_id = ? AND logical_artifact_key = 'memo:company_product'
      )`)
      .run(prepared.harness.input.mandate.runId);
    database.close();
    const round = createSqliteDepartmentRound(prepared.options);
    const accepted = round.acceptedMemos(prepared.harness.input.mandate.runId);

    // When
    const staged = await round.stage({
      runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
      memberArtifactIds: accepted.map((memo) => memo.artifactId),
    });
    const replay = await round.drain(prepared.harness.input.mandate.runId);
    await round.close();

    // Then
    expect(staged.kind).toBe("staged");
    expect(replay.receipts).toHaveLength(3);
    expect(new Set(replay.committedDepartmentIds)).toEqual(
      new Set(["market", "financial", "risk"]),
    );
    expect(replay.challengeStartAllowed).toBe(false);
    expect(prepared.codex.departmentLaunches).toBe(3);
  });

  it("rejects a cross-run Noah memo before any meeting attempt", async () => {
    // Given
    const prepared = await stageAcceptedSpecialists(temporaryRoot(), "none");
    const round = createSqliteDepartmentRound(prepared.options);
    const accepted = round.acceptedMemos(prepared.harness.input.mandate.runId);
    const crossRunNoah = ArtifactIdSchema.parse(
      "ffffffff-ffff-4fff-8fff-ffffffffffff",
    );
    const substituted = accepted.map((memo) =>
      memo.roleId === "financial" ? crossRunNoah : memo.artifactId,
    );

    // When
    const staged = await round.stage({
      runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
      memberArtifactIds: substituted,
    });
    const replay = round.replay(prepared.harness.input.mandate.runId);
    await round.close();

    // Then
    expect(staged).toEqual({
      kind: "blocked",
      reason: "cross_run_or_snapshot_member",
    });
    expect(replay.receipts).toHaveLength(0);
    expect(replay.challengeStartAllowed).toBe(false);
    expect(prepared.codex.departmentLaunches).toBe(0);
  });

  it("rejects an unsupported number without overwriting the lead summary", async () => {
    // Given
    const prepared = await stageAcceptedSpecialists(
      temporaryRoot(),
      "uncited_number",
    );
    const round = createSqliteDepartmentRound(prepared.options);
    const accepted = round.acceptedMemos(prepared.harness.input.mandate.runId);
    await round.stage({
      runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
      memberArtifactIds: accepted.map((memo) => memo.artifactId),
    });

    // When
    const replay = await round.drain(prepared.harness.input.mandate.runId);
    await round.close();

    // Then
    expect(replay.challengeStartAllowed).toBe(false);
    expect(replay.committedDepartmentIds).not.toContain("financial");
    expect(replay.artifactIds).toHaveLength(3);
    expect(replay.receipts).toHaveLength(5);
    expect(prepared.codex.departmentLaunches).toBe(5);
  });

  it.each(["new_claim"] as const)(
    "rejects %s from a department result without opening the next stage",
    async (fault) => {
      // Given
      const prepared = await stageAcceptedSpecialists(temporaryRoot(), fault);
      const round = createSqliteDepartmentRound(prepared.options);
      const accepted = round.acceptedMemos(
        prepared.harness.input.mandate.runId,
      );
      await round.stage({
        runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
        memberArtifactIds: accepted.map((memo) => memo.artifactId),
      });

      // When
      const replay = await round.drain(prepared.harness.input.mandate.runId);
      await round.close();

      // Then
      expect(replay.challengeStartAllowed).toBe(false);
      expect(replay.committedDepartmentIds).not.toContain("financial");
      expect(replay.artifactIds).toHaveLength(3);
    },
  );

  it.each(["mistyped_dissent_claim"] as const)(
    "canonicalizes non-authoritative %s fields without spending a replacement",
    async (fault) => {
      // Given
      const prepared = await stageAcceptedSpecialists(temporaryRoot(), fault);
      const round = createSqliteDepartmentRound(prepared.options);
      const accepted = round.acceptedMemos(
        prepared.harness.input.mandate.runId,
      );
      await round.stage({
        runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
        memberArtifactIds: accepted.map((memo) => memo.artifactId),
      });

      // When
      const replay = await round.drain(prepared.harness.input.mandate.runId);
      await round.close();

      // Then
      expect(replay.challengeStartAllowed).toBe(true);
      expect(replay.committedDepartmentIds).toContain("financial");
      expect(replay.artifactIds).toHaveLength(4);
      expect(replay.receipts).toHaveLength(4);
      expect(prepared.codex.departmentLaunches).toBe(4);
    },
  );

  it.each(["new_evidence", "absent_member_speech"] as const)(
    "rejects invalid authenticated %s fields without overwriting them",
    async (fault) => {
      const prepared = await stageAcceptedSpecialists(temporaryRoot(), fault);
      const round = createSqliteDepartmentRound(prepared.options);
      const accepted = round.acceptedMemos(
        prepared.harness.input.mandate.runId,
      );
      await round.stage({
        runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
        memberArtifactIds: accepted.map((memo) => memo.artifactId),
      });

      const replay = await round.drain(prepared.harness.input.mandate.runId);
      await round.close();

      expect(replay.challengeStartAllowed).toBe(false);
      expect(replay.committedDepartmentIds).not.toContain("financial");
      expect(replay.artifactIds).toHaveLength(3);
      expect(replay.receipts).toHaveLength(5);
      expect(prepared.codex.departmentLaunches).toBe(5);
    },
  );
});
