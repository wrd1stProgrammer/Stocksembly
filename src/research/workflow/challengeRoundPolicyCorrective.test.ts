import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ArtifactIdSchema, RunIdSchema } from "../domain/ids";
import { createSqliteChallengeRound } from "./challengeRound";
import type { ChallengeFault } from "./challengeRound.testSupport";
import { stageAcceptedDepartments } from "./challengeRound.testSupport";

const roots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "challenge-policy-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

async function stage(fault: ChallengeFault) {
  const prepared = await stageAcceptedDepartments(temporaryRoot(), fault);
  const round = createSqliteChallengeRound(prepared.options);
  const result = await round.stage({
    runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
    consolidationArtifactIds: prepared.departmentReplay.artifactIds.map((id) =>
      ArtifactIdSchema.parse(id),
    ),
  });
  await round.close();
  return { prepared, result };
}

describe("blind challenge attribution and rhetoric policy", () => {
  it.each([
    ["June revenue", "ambiguous_june_neutral_source"],
    ["minute abbreviation", "ambiguous_min_neutral_source"],
    ["evidence-based English claim correction", "claim_wrong_en_source"],
    ["evidence-based Korean claim correction", "claim_wrong_ko_source"],
    ["generic benchmark evidence", "generic_benchmark_source"],
  ] as const)("accepts %s", async (_label, fault) => {
    const { prepared, result } = await stage(fault);

    expect(result.kind).toBe("staged");
    expect(prepared.codex.challengeInputs).toHaveLength(0);
  });

  it.each([
    ["According to June", "ambiguous_june_attribution_source"],
    ["Min said", "ambiguous_min_attribution_source"],
    ["Korean ambiguous-name attribution", "ambiguous_ko_attribution_source"],
    ["claim is absurd", "claim_harsh_attack_source"],
  ] as const)("blocks %s before prompt launch", async (_label, fault) => {
    const { prepared, result } = await stage(fault);

    expect(result).toEqual({ kind: "blocked", reason: "blind_input_unsafe" });
    expect(prepared.codex.challengeLaunches).toBe(0);
    expect(prepared.codex.challengeInputs).toHaveLength(0);
  });
});
