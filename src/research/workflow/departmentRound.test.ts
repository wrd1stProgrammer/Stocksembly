import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { DepartmentConsolidationOutputSchema } from "../domain/agentOutputs";
import { ArtifactIdSchema, RunIdSchema } from "../domain/ids";
import { WORKFLOW_V1_ROLE_REGISTRY } from "../domain/roleRegistry";
import { createPostgresDepartmentRound } from "./departmentRound";
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

async function expectGroundedFinancialRecovery(
  prepared: Awaited<ReturnType<typeof stageAcceptedSpecialists>>,
) {
  const row = (
    await prepared.options.database.query(
      `SELECT envelope_json FROM agent_output_commits JOIN attempts USING (attempt_id)
      WHERE attempts.run_id = $1 AND logical_artifact_key = 'consolidation:financial'`,
      [prepared.harness.input.mandate.runId],
    )
  ).rows[0];
  const envelope = z.object({ envelope_json: z.string() }).parse(row);
  const output = z
    .object({ payload: DepartmentConsolidationOutputSchema })
    .parse(JSON.parse(envelope.envelope_json)).payload;
  const request = prepared.codex.departmentInputs.find(
    (input) => input.department.id === "financial",
  );
  if (!request) throw new Error("missing financial input");
  const positions = request.memberArtifacts.flatMap(
    (member) => member.memo.positions,
  );
  expect(output.publicationMode).toBe("limited_compilation");
  expect(output.decisionPacket?.stanceContribution).toBe("uncertain");
  expect(output.sourceArtifactIds).toEqual(
    request.memberArtifacts.map((member) => member.artifactId),
  );
  expect(
    output.acceptedClaimIds.every((id) =>
      positions.some((position) => position.claimId === id),
    ),
  ).toBe(true);
  expect(
    output.evidencePriorityArtifactIds.every((id) =>
      positions.some((position) => position.evidenceArtifactIds.includes(id)),
    ),
  ).toBe(true);
  expect(output.publicSummary.en).not.toContain("37");
  expect(output.publicSummary.en).not.toContain("Aria said");
}

describe("department round", () => {
  it("commits four distinct lead meetings from exact authenticated member sets while retaining dissent and unknowns", async () => {
    // Given
    const prepared = await stageAcceptedSpecialists(temporaryRoot(), "none");
    const round = createPostgresDepartmentRound(prepared.options);
    const accepted = await round.acceptedMemos(
      prepared.harness.input.mandate.runId,
    );

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
    const database = prepared.options.database;
    await database.query(
      "DELETE FROM agent_output_commits WHERE attempt_id = (\n        SELECT attempt_id FROM attempts\n        WHERE run_id = $1 AND logical_artifact_key = 'memo:company_product'\n      )",
      [prepared.harness.input.mandate.runId],
    );

    const round = createPostgresDepartmentRound(prepared.options);
    const accepted = await round.acceptedMemos(
      prepared.harness.input.mandate.runId,
    );

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
    const round = createPostgresDepartmentRound(prepared.options);
    const accepted = await round.acceptedMemos(
      prepared.harness.input.mandate.runId,
    );
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
    const replay = await round.replay(prepared.harness.input.mandate.runId);
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

  it("replaces an unsupported number with authenticated findings and continues", async () => {
    // Given
    const prepared = await stageAcceptedSpecialists(
      temporaryRoot(),
      "uncited_number",
    );
    const round = createPostgresDepartmentRound(prepared.options);
    const accepted = await round.acceptedMemos(
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
    expect(replay.artifactIds).toHaveLength(4);
    expect(replay.receipts).toHaveLength(4);
    expect(prepared.codex.departmentLaunches).toBe(4);
    await expectGroundedFinancialRecovery(prepared);
  });

  it.each(["new_claim"] as const)(
    "excludes %s and continues using authenticated findings",
    async (fault) => {
      // Given
      const prepared = await stageAcceptedSpecialists(temporaryRoot(), fault);
      const round = createPostgresDepartmentRound(prepared.options);
      const accepted = await round.acceptedMemos(
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
      expect(replay.artifactIds).toHaveLength(4);
      expect(prepared.codex.departmentLaunches).toBe(4);
      await expectGroundedFinancialRecovery(prepared);
    },
  );

  it.each(["mistyped_dissent_claim"] as const)(
    "canonicalizes non-authoritative %s fields without spending a replacement",
    async (fault) => {
      // Given
      const prepared = await stageAcceptedSpecialists(temporaryRoot(), fault);
      const round = createPostgresDepartmentRound(prepared.options);
      const accepted = await round.acceptedMemos(
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
    "excludes invalid %s fields from a limited compilation and continues",
    async (fault) => {
      const prepared = await stageAcceptedSpecialists(temporaryRoot(), fault);
      const round = createPostgresDepartmentRound(prepared.options);
      const accepted = await round.acceptedMemos(
        prepared.harness.input.mandate.runId,
      );
      await round.stage({
        runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
        memberArtifactIds: accepted.map((memo) => memo.artifactId),
      });

      const replay = await round.drain(prepared.harness.input.mandate.runId);
      await round.close();

      expect(replay.challengeStartAllowed).toBe(true);
      expect(replay.artifactIds).toHaveLength(4);
      expect(replay.receipts).toHaveLength(4);
      expect(prepared.codex.departmentLaunches).toBe(4);
      await expectGroundedFinancialRecovery(prepared);
    },
  );
});
