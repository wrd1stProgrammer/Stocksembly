import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createOfficialSpecialistRound } from "../compositions/officialWorker";
import { hashBytes, hashCanonical } from "../domain/contractHelpers";
import { LIMITS } from "../domain/limits.constants";
import { WORKFLOW_V1_SPECIALIST_IDS } from "../domain/roleRegistry";
import { ArtifactDigestSchema } from "../ports/artifacts";
import { codexInputHash } from "../server/codex/codexReservation";
import { buildTechnicalChart } from "../technical/buildTechnicalChart";
import { createLeaseEngine } from "../worker/leaseEngine";
import {
  createRuntimeAttemptHandler,
  LeaseWorkerCliError,
  runLeaseWorkerProcess,
} from "../worker/leaseWorker";
import { workflowTestDatabase } from "./postgresDatabase.testSupport";
import { SpecialistMemoOutputSchema } from "./specialistRoundContracts";
import { createPostgresSpecialistRound } from "./specialistRoundPostgres";
import { makePostgresRoundHarness } from "./specialistRoundPostgres.testSupport";
import { prepareSpecialistJobs } from "./specialistRoundPostgresStage";

const temporaryRoots: string[] = [];
const specialistCount = WORKFLOW_V1_SPECIALIST_IDS.length;

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

describe("official PostgreSQL specialist round", () => {
  it("bounds role prompts while retaining every assigned evidence source", async () => {
    // Given
    const harness = await makePostgresRoundHarness("none");
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        value: { text: "revenue margin competition risk ".repeat(12_000) },
      }),
    );
    const sources = harness.sources.map((source) => ({
      ...source,
      bytes:
        source.evidenceId === "annual"
          ? new TextEncoder().encode(
              JSON.stringify({
                technicalChart: buildTechnicalChart({
                  symbol: "NVDA",
                  asOf: "2026-07-23T00:00:00.000Z",
                  sets: [],
                }),
              }),
            )
          : bytes,
    }));
    const sourceHashes = new Map(
      sources.map((source) => [
        source.evidenceId,
        ArtifactDigestSchema.parse(hashBytes(source.bytes)),
      ]),
    );
    const assignments = harness.input.assignments.assignments.map(
      (assignment) => {
        const artifacts = assignment.evidenceSlice.artifacts.map((artifact) => {
          const contentHash = sourceHashes.get(artifact.evidenceId);
          if (contentHash === undefined)
            throw new TypeError("missing large evidence fixture");
          return {
            ...artifact,
            ...(artifact.evidenceId === "annual"
              ? { dataset: "market_bars" as const }
              : {}),
            rawHash: contentHash,
            ...(artifact.normalizedHash === undefined
              ? {}
              : { normalizedHash: contentHash }),
          };
        });
        const sliceBody = {
          ...assignment.evidenceSlice,
          artifacts,
        };
        const { sliceHash: _sliceHash, ...hashable } = sliceBody;
        return {
          ...assignment,
          evidenceSlice: {
            ...hashable,
            sliceHash: hashCanonical(hashable),
          },
        };
      },
    );
    const snapshotArtifacts = harness.input.snapshot.artifacts.map(
      (artifact) => {
        const contentHash = sourceHashes.get(artifact.evidenceId);
        if (contentHash === undefined)
          throw new TypeError("missing snapshot evidence fixture");
        return {
          ...artifact,
          ...(artifact.evidenceId === "annual"
            ? { dataset: "market_bars" as const }
            : {}),
          rawHash: contentHash,
          ...(artifact.normalizedHash === undefined
            ? {}
            : { normalizedHash: contentHash }),
        };
      },
    );

    // When
    const jobs = prepareSpecialistJobs(
      {
        ...harness.input,
        snapshot: {
          ...harness.input.snapshot,
          artifacts: snapshotArtifacts,
        },
        assignments: {
          ...harness.input.assignments,
          assignments,
        },
      },
      sources,
    );

    // Then
    const june = jobs.find((job) => job.roleId === "market_news");
    expect(
      june?.prompt
        .split("\n")
        .filter((line) => line.startsWith("EVIDENCE "))[0],
    ).toBe("EVIDENCE annual");
    expect(june?.prompt).toContain('"frames":[{"timeframe":"1h"');
    expect(
      Math.max(...jobs.map((job) => Buffer.byteLength(job.prompt))),
    ).toBeLessThanOrEqual(80 * 1_024);
    expect(
      jobs.every(
        (job) =>
          job.sourceArtifactIds.length > 0 &&
          job.sourceArtifactIds.every((id) => job.prompt.includes(id)),
      ),
    ).toBe(true);
  });

  it("durably commits every isolated specialist memo with global concurrency three and replays after restart", async () => {
    // Given
    const root = mkdtempSync(join(tmpdir(), "specialist-round-postgres-"));
    temporaryRoots.push(root);
    const harness = await makePostgresRoundHarness("none");
    const options = {
      database: await workflowTestDatabase(),
      attemptRoot: join(root, "attempts"),
      ownerId: "specialist-worker-a",
      cas: harness.cas,
      codex: harness.codex,
      now: () => "2026-07-23T00:00:00.000Z",
    };
    const round = await createPostgresSpecialistRound(options);

    // When
    await round.stage(harness.input, harness.sources);
    const completed = await round.drain(harness.input.mandate.runId);
    await round.close();
    const restarted = await createPostgresSpecialistRound(options);
    const replay = await restarted.replay(harness.input.mandate.runId);
    await restarted.close();

    // Then
    expect(completed.receipts.map((receipt) => receipt.outcome)).toEqual(
      Array.from({ length: specialistCount }, () => "accepted"),
    );
    expect(completed.artifactIds).toHaveLength(specialistCount);
    expect(completed.departmentStartAllowed).toBe(true);
    expect(completed.receipts).toHaveLength(specialistCount);
    expect(completed.receipts.map((receipt) => receipt.ordinal)).toEqual(
      Array.from({ length: specialistCount }, (_, index) => index + 1),
    );
    expect(
      completed.receipts.every((receipt) => receipt.evidenceRecorded),
    ).toBe(true);
    expect(
      new Set(completed.receipts.map((receipt) => receipt.attemptId)).size,
    ).toBe(specialistCount);
    expect(new Set(completed.artifactIds).size).toBe(specialistCount);
    expect(completed.eventSequences).toHaveLength(specialistCount);
    expect(harness.codex.maximumActive).toBeGreaterThan(1);
    expect(harness.codex.maximumActive).toBeLessThanOrEqual(3);
    expect(replay).toEqual(completed);
  });

  it("uses durable replacement ordinals and blocks departments after the retry allowance is exhausted", async () => {
    // Given
    const onceRoot = mkdtempSync(join(tmpdir(), "specialist-round-once-"));
    const alwaysRoot = mkdtempSync(join(tmpdir(), "specialist-round-always-"));
    temporaryRoots.push(onceRoot, alwaysRoot);
    const once = await makePostgresRoundHarness("once");
    const always = await makePostgresRoundHarness("always");
    const onceRound = await createPostgresSpecialistRound({
      database: await workflowTestDatabase(),
      attemptRoot: join(onceRoot, "attempts"),
      ownerId: "worker-once",
      cas: once.cas,
      codex: once.codex,
      now: () => "2026-07-23T00:00:00.000Z",
    });
    const alwaysRound = await createPostgresSpecialistRound({
      database: await workflowTestDatabase(),
      attemptRoot: join(alwaysRoot, "attempts"),
      ownerId: "worker-always",
      cas: always.cas,
      codex: always.codex,
      now: () => "2026-07-23T00:00:00.000Z",
    });

    // When
    await onceRound.stage(once.input, once.sources);
    const recovered = await onceRound.drain(once.input.mandate.runId);
    await alwaysRound.stage(always.input, always.sources);
    const incomplete = await alwaysRound.drain(always.input.mandate.runId);
    await onceRound.close();
    await alwaysRound.close();

    // Then
    expect(recovered.receipts).toHaveLength(specialistCount + 1);
    expect(recovered.receipts.at(-1)?.outcome).toBe("accepted");
    expect(recovered.artifactIds).toHaveLength(specialistCount);
    expect(recovered.departmentStartAllowed).toBe(true);
    expect(recovered.receipts.at(-1)?.ordinal).toBe(specialistCount + 1);
    expect(recovered.artifactIds).toHaveLength(specialistCount);
    expect(incomplete.departmentStartAllowed).toBe(false);
    expect(incomplete.receipts).toHaveLength(
      specialistCount + LIMITS.research.maxReplacementsPerArtifact,
    );
    expect(incomplete.receipts.at(-1)?.ordinal).toBe(
      specialistCount + LIMITS.research.maxReplacementsPerArtifact,
    );
    expect(incomplete.artifactIds).toHaveLength(specialistCount - 1);
  });

  it("corrects an invented citation with the durable replacement attempt", async () => {
    // Given
    const root = mkdtempSync(join(tmpdir(), "specialist-citation-retry-"));
    temporaryRoots.push(root);
    const harness = await makePostgresRoundHarness("citation_once");
    const database = await workflowTestDatabase();
    const round = await createPostgresSpecialistRound({
      database,
      attemptRoot: join(root, "attempts"),
      ownerId: "worker-citation-retry",
      cas: harness.cas,
      codex: harness.codex,
      now: () => "2026-07-23T00:00:00.000Z",
    });

    // When
    await round.stage(harness.input, harness.sources);
    const result = await round.drain(harness.input.mandate.runId);
    await round.close();

    // Then
    expect(result.departmentStartAllowed).toBe(true);
    expect(result.artifactIds).toHaveLength(specialistCount);
    expect(result.receipts).toHaveLength(specialistCount + 1);
    const correctivePrompt = harness.codex.prompts.find((prompt) =>
      prompt.includes("CORRECTIVE RETRY — INVALID CITATION IDS"),
    );
    expect(correctivePrompt).toContain("00000000-0000-4000-8000-000000000999");
    expect(correctivePrompt).toContain(harness.sources[0]?.artifactId);

    const replacement = (
      await database.query(
        'SELECT attempts.input_hash AS "attemptInputHash",\n        research_call_ordinals.input_hash AS "ordinalInputHash",\n        jobs.input_hash AS "jobInputHash"\n        FROM attempts JOIN jobs USING(job_id)\n        JOIN research_call_ordinals ON research_call_ordinals.attempt_id = attempts.attempt_id\n        WHERE replacement_of_attempt_id IS NOT NULL\n        ORDER BY ordinal LIMIT 1',
        [],
      )
    ).rows[0] as {
      attemptInputHash: string;
      ordinalInputHash: string;
      jobInputHash: string;
    };

    const correctedInputHash = codexInputHash({
      stage: "memo",
      prompt: correctivePrompt!,
      outputSchema: SpecialistMemoOutputSchema,
    });
    expect(replacement).toEqual({
      attemptInputHash: correctedInputHash,
      ordinalInputHash: correctedInputHash,
      jobInputHash: correctedInputHash,
    });
  });

  it("records the citation-specific reason when the corrective attempt also fails", async () => {
    // Given
    const root = mkdtempSync(join(tmpdir(), "specialist-citation-exhausted-"));
    temporaryRoots.push(root);
    const database = await workflowTestDatabase();
    const harness = await makePostgresRoundHarness("citation_always");
    const round = await createPostgresSpecialistRound({
      database,
      attemptRoot: join(root, "attempts"),
      ownerId: "worker-citation-exhausted",
      cas: harness.cas,
      codex: harness.codex,
      now: () => "2026-07-23T00:00:00.000Z",
    });

    // When
    await round.stage(harness.input, harness.sources);
    const result = await round.drain(harness.input.mandate.runId);
    await round.close();

    const reason = (
      await database.query(
        `SELECT payload_json::jsonb ->> 'code' AS code
      FROM run_events WHERE run_id = $1 AND event_type = 'attempt_committed'
      AND payload_json::jsonb ->> 'code' IS NOT NULL ORDER BY sequence DESC LIMIT 1`,
        [harness.input.mandate.runId],
      )
    ).rows[0]?.code;

    // Then
    expect(result.departmentStartAllowed).toBe(false);
    expect(result.artifactIds).toHaveLength(specialistCount - 1);
    expect(reason).toBe("specialist_citation_invalid_after_retry");
  });

  it("is the workflow implementation exported by official composition", () => {
    // Given
    const officialFactory = createOfficialSpecialistRound;

    // When
    const workflowFactory = createPostgresSpecialistRound;

    // Then
    expect(officialFactory).toBe(workflowFactory);
  });

  it("selects the official handler from runtime serve and executes a staged PostgreSQL job", async () => {
    // Given
    const root = mkdtempSync(join(tmpdir(), "specialist-round-runtime-"));
    temporaryRoots.push(root);
    const harness = await makePostgresRoundHarness("none");
    const database = await workflowTestDatabase();
    const attemptRoot = join(root, "attempts");
    const now = () => "2026-07-23T00:00:00.000Z";
    const staging = await createPostgresSpecialistRound({
      database,
      attemptRoot,
      ownerId: "runtime-worker",
      cas: harness.cas,
      codex: harness.codex,
      now,
    });
    await staging.stage(harness.input, harness.sources);
    await staging.close();

    // When
    const runtime = await createRuntimeAttemptHandler(
      {
        dataDirectory: root,
        database,
        ownerId: "runtime-worker",
      },
      { cas: harness.cas, codex: harness.codex, now },
    );
    const engine = createLeaseEngine({
      pool: database,
      ownerId: "runtime-worker",
      handler: runtime.handler,
      clock: { now },
    });
    const result = await engine.poll();
    await engine.shutdown();
    await runtime.close();
    const verification = await createPostgresSpecialistRound({
      database,
      attemptRoot,
      ownerId: "runtime-verifier",
      cas: harness.cas,
      codex: harness.codex,
      now,
    });
    const replay = await verification.replay(harness.input.mandate.runId);
    await verification.close();
    // Then
    expect(result.kind).toBe("handled");
    expect(harness.codex.launches).toBe(1);
    expect(replay.artifactIds).toHaveLength(1);
    expect(replay.receipts[0]?.outcome).toBe("accepted");
  });

  it("rejects handler injection for public runtime commands", async () => {
    // Given
    const handler = {
      run: async () => ({ kind: "accepted" as const }),
    };

    // When
    const command = runLeaseWorkerProcess(["readiness"], handler);

    // Then
    await expect(command).rejects.toBeInstanceOf(LeaseWorkerCliError);
  });
});
