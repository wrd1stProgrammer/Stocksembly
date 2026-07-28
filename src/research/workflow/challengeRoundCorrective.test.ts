import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ArtifactIdSchema, RunIdSchema } from "../domain/ids";
import type {
  ArtifactCasPort,
  ArtifactDescriptor,
  ArtifactDigest,
  ArtifactRead,
  ArtifactWrite,
} from "../ports/artifacts";
import { createSqliteChallengeRound } from "./challengeRound";
import { stageAcceptedDepartments } from "./challengeRound.testSupport";
import { committedChallengeArtifacts } from "./challengeRoundArtifact.testSupport";

const roots: string[] = [];

class FirstReadTamperingCas implements ArtifactCasPort {
  #tampered = false;

  constructor(private readonly delegate: ArtifactCasPort) {}

  put(artifact: ArtifactWrite): Promise<ArtifactDescriptor> {
    return this.delegate.put(artifact);
  }

  async get(digest: ArtifactDigest): Promise<ArtifactRead | undefined> {
    const read = await this.delegate.get(digest);
    if (read === undefined || this.#tampered) return read;
    this.#tampered = true;
    return {
      descriptor: read.descriptor,
      bytes: new TextEncoder().encode("tampered-agent-artifact"),
    };
  }

  has(digest: ArtifactDigest): Promise<boolean> {
    return this.delegate.has(digest);
  }
}

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "challenge-corrective-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

describe("blind challenge corrective trust boundary", () => {
  it.each([
    ["English canonical role-title attribution", "role_title_en_source"],
    ["Korean canonical role-title attribution", "role_title_ko_source"],
    ["severe personal slur", "severe_slur_source"],
    ["evaluative attack on a take", "evaluative_attack_source"],
  ] as const)("blocks %s before prompt launch", async (_label, fault) => {
    // Given
    const prepared = await stageAcceptedDepartments(temporaryRoot(), fault);
    const round = createSqliteChallengeRound(prepared.options);

    // When
    const result = await round.stage({
      runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
      consolidationArtifactIds: prepared.departmentReplay.artifactIds.map(
        (id) => ArtifactIdSchema.parse(id),
      ),
    });
    await round.close();

    // Then
    expect(result).toEqual({ kind: "blocked", reason: "blind_input_unsafe" });
    expect(prepared.codex.challengeLaunches).toBe(0);
    expect(prepared.codex.challengeInputs).toHaveLength(0);
  });

  it("blocks accepted memo persona attribution and personal rhetoric before prompt launch", async () => {
    // Given
    const prepared = await stageAcceptedDepartments(
      temporaryRoot(),
      "persona_rhetoric_source",
    );
    const round = createSqliteChallengeRound(prepared.options);

    // When
    const result = await round.stage({
      runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
      consolidationArtifactIds: prepared.departmentReplay.artifactIds.map(
        (id) => ArtifactIdSchema.parse(id),
      ),
    });
    await round.close();

    // Then
    expect(result).toEqual({ kind: "blocked", reason: "blind_input_unsafe" });
    expect(prepared.codex.challengeLaunches).toBe(0);
    expect(prepared.codex.challengeInputs).toHaveLength(0);
  });

  it("does not mistake generic finance language for personal attribution", async () => {
    // Given
    const prepared = await stageAcceptedDepartments(
      temporaryRoot(),
      "generic_finance_source",
    );
    const round = createSqliteChallengeRound(prepared.options);

    // When
    const result = await round.stage({
      runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
      consolidationArtifactIds: prepared.departmentReplay.artifactIds.map(
        (id) => ArtifactIdSchema.parse(id),
      ),
    });
    await round.close();

    // Then
    expect(result.kind).toBe("staged");
    expect(prepared.codex.challengeInputs).toHaveLength(0);
  });

  it("renders exact-limit source summaries into bounded bilingual challenge text", async () => {
    // Given
    const prepared = await stageAcceptedDepartments(
      temporaryRoot(),
      "max_public_summary",
    );
    const round = createSqliteChallengeRound(prepared.options);
    await round.stage({
      runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
      consolidationArtifactIds: prepared.departmentReplay.artifactIds.map(
        (id) => ArtifactIdSchema.parse(id),
      ),
    });

    // When
    const replay = await round.drain(prepared.harness.input.mandate.runId);
    const artifacts = await committedChallengeArtifacts(
      prepared.options.databasePath,
      prepared.options.cas,
    );
    await round.close();

    // Then
    expect(replay.responseStartAllowed).toBe(true);
    expect(artifacts).toHaveLength(4);
    for (const artifact of artifacts) {
      expect(artifact.payload.publicChallenge.en.length).toBeLessThanOrEqual(
        4_000,
      );
      expect(artifact.payload.publicChallenge.ko.length).toBeLessThanOrEqual(
        4_000,
      );
      expect(artifact.payload.publicChallenge.en).toMatch(
        /^Counterpoint: C+ Target under challenge: T+$/,
      );
      expect(artifact.payload.publicChallenge.ko).toMatch(
        /^반론: 반+ 검토 대상: 대+$/,
      );
    }
  });

  it("blocks a tampered authenticated memo parent before challenge staging", async () => {
    // Given
    const prepared = await stageAcceptedDepartments(temporaryRoot(), "none");
    const round = createSqliteChallengeRound({
      ...prepared.options,
      cas: new FirstReadTamperingCas(prepared.options.cas),
    });

    // When
    const result = await round.stage({
      runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
      consolidationArtifactIds: prepared.departmentReplay.artifactIds.map(
        (id) => ArtifactIdSchema.parse(id),
      ),
    });
    await round.close();

    // Then
    expect(result).toEqual({
      kind: "blocked",
      reason: "consolidation_artifact_authentication_failed",
    });
    expect(prepared.codex.challengeLaunches).toBe(0);
  });

  it("blocks staging when a target department has only supporting non-target evidence", async () => {
    // Given
    const prepared = await stageAcceptedDepartments(
      temporaryRoot(),
      "support_only",
    );
    const round = createSqliteChallengeRound(prepared.options);

    // When
    const result = await round.stage({
      runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
      consolidationArtifactIds: prepared.departmentReplay.artifactIds.map(
        (id) => ArtifactIdSchema.parse(id),
      ),
    });
    await round.close();

    // Then
    expect(result).toEqual({
      kind: "blocked",
      reason: "counterevidence_unavailable",
    });
    expect(prepared.codex.challengeLaunches).toBe(0);
  });

  it("requires complete memo parents and an actual rebuttal instead of copied target prose", async () => {
    // Given
    const prepared = await stageAcceptedDepartments(temporaryRoot(), "none");
    const round = createSqliteChallengeRound(prepared.options);
    await round.stage({
      runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
      consolidationArtifactIds: prepared.departmentReplay.artifactIds.map(
        (id) => ArtifactIdSchema.parse(id),
      ),
    });

    // When
    const replay = await round.drain(prepared.harness.input.mandate.runId);
    const artifacts = await committedChallengeArtifacts(
      prepared.options.databasePath,
      prepared.options.cas,
    );
    await round.close();

    // Then
    expect(replay.responseStartAllowed).toBe(true);
    expect(
      prepared.codex.challengeInputs.every(
        (input) => input.sourceArtifactIds.length >= 3,
      ),
    ).toBe(true);
    expect(artifacts).toHaveLength(4);
    for (const artifact of artifacts) {
      const challengerId = artifact.logicalArtifactId.replace(
        /^challenge:/,
        "",
      );
      const input = prepared.codex.challengeInputs.find(
        (candidate) => candidate.assignment.challengerId === challengerId,
      );
      if (input === undefined) throw new TypeError("missing challenge input");
      expect(artifact.payload.publicChallenge).not.toEqual(
        input.target.publicSummary,
      );
      expect(artifact.payload.publicChallenge.en).toContain(
        input.counterpoint.publicSummary.en,
      );
      expect(artifact.payload.publicChallenge.ko).toContain(
        input.counterpoint.publicSummary.ko,
      );
      expect(
        input.sourceArtifactIds.every((id) =>
          artifact.parentArtifactIds.includes(id),
        ),
      ).toBe(true);
    }
  });
});
