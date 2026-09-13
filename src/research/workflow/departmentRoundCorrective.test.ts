import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CALL_BUDGET_POLICY } from "../domain/callBudgetContracts";
import { RunIdSchema } from "../domain/ids";
import { createPostgresDepartmentRound } from "./departmentRound";
import { stageAcceptedSpecialists } from "./departmentRound.testSupport";
import type { DepartmentFault } from "./departmentRoundCandidates.testSupport";

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "department-corrective-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

const correctiveFaults = [
  "absent_role_id_speech",
  "absent_korean_speech",
  "absent_maya_speech",
  "absent_maya_korean_speech",
  "extra_open_question",
] as const satisfies readonly DepartmentFault[];

describe("department consolidation trust boundary", () => {
  it.each([
    "source_backed_role_words",
    "source_backed_issuer_report",
    "qualitative_new_fact",
    "qualitative_new_dissent",
  ] as const)(
    "accepts authenticated %s outside persona attribution",
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
      expect(prepared.codex.departmentLaunches).toBe(4);
    },
  );

  it.each(correctiveFaults)(
    "rejects %s before trusted commit and keeps the challenge gate closed",
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
      expect(replay.challengeStartAllowed).toBe(false);
      expect(replay.committedDepartmentIds).not.toContain("financial");
      expect(replay.artifactIds).toHaveLength(3);
      expect(
        replay.receipts.filter(
          (receipt) => receipt.departmentId === "financial",
        ),
      ).toHaveLength(CALL_BUDGET_POLICY.maxAttemptsPerLogicalArtifact);
      expect(prepared.codex.departmentLaunches).toBe(
        3 + CALL_BUDGET_POLICY.maxAttemptsPerLogicalArtifact,
      );
    },
  );
});
