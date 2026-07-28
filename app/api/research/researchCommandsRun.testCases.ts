import { expect, it } from "vitest";
import {
  commandRequest,
  createRun,
  databaseScalar,
  postCommand,
  publishRun,
  setRunStatus,
} from "./researchCommands.testSupport";
import type { ApiHarness } from "./researchRoutes.testSupport";
import { json } from "./researchRoutes.testSupport";

export function registerResearchRunCommandTests(
  harnessValue: () => ApiHarness,
): void {
  it("creates only a failed parent's immutable same-snapshot retry", async () => {
    // Given
    const harness = harnessValue();
    const parent = await createRun(harness, "retry-parent");
    setRunStatus(harness, parent.runId, "failed");

    // When
    const created = await postCommand(
      harness,
      `/api/research/runs/${parent.runId}/retries`,
      "retry-child",
    );
    const replay = await postCommand(
      harness,
      `/api/research/runs/${parent.runId}/retries`,
      "retry-child",
    );

    // Then
    expect([created.response.status, replay.response.status]).toEqual([
      202, 202,
    ]);
    expect(replay.body).toEqual(created.body);
    expect(created.body).toMatchObject({
      run: {
        snapshotId: parent.snapshotId,
        parentRunId: parent.runId,
        lineage: "same-snapshot-retry",
      },
    });
    expect(
      databaseScalar(
        harness,
        "SELECT status FROM runs WHERE run_id = ?",
        parent.runId,
      ),
    ).toBe("failed");
  });

  it("rejects retry for queued or completed runs", async () => {
    // Given
    const harness = harnessValue();
    const queued = await createRun(harness, "retry-queued");
    const completed = await createRun(harness, "retry-completed");
    setRunStatus(harness, completed.runId, "completed");

    // When
    const results = await Promise.all([
      harness.api.handle(
        commandRequest(
          harness,
          `/api/research/runs/${queued.runId}/retries`,
          "retry-q",
        ),
      ),
      harness.api.handle(
        commandRequest(
          harness,
          `/api/research/runs/${completed.runId}/retries`,
          "retry-c",
        ),
      ),
    ]);

    // Then
    expect(results.map((response) => response.status)).toEqual([409, 409]);
  });

  it("allocates fresh-snapshot follow-up versions atomically while v1 remains current", async () => {
    // Given
    const harness = harnessValue();
    const parent = await createRun(harness, "follow-parent");
    const publication = await publishRun(harness, parent);

    // When
    const [second, third] = await Promise.all([
      postCommand(
        harness,
        `/api/research/reports/${publication.reportId}/follow-ups`,
        "follow-v2",
        { question: "Reassess margins" },
      ),
      postCommand(
        harness,
        `/api/research/reports/${publication.reportId}/follow-ups`,
        "follow-v3",
        { question: "Reassess risks" },
      ),
    ]);

    // Then
    expect([second.response.status, third.response.status]).toEqual([202, 202]);
    expect([second.body, third.body]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          run: expect.objectContaining({ version: 2 }),
        }),
        expect.objectContaining({
          run: expect.objectContaining({ version: 3 }),
        }),
      ]),
    );
    expect(
      databaseScalar(
        harness,
        "SELECT report_id FROM runs WHERE run_id = ?",
        parent.runId,
      ),
    ).toBe(publication.reportId);
    expect(
      databaseScalar(harness, "SELECT COUNT(DISTINCT snapshot_id) FROM runs"),
    ).toBe(3);
  });

  it("rejects cancellation after publication without detaching the report", async () => {
    // Given
    const harness = harnessValue();
    const run = await createRun(harness, "published-cancel");
    const publication = await publishRun(harness, run);

    // When
    const response = await harness.api.handle(
      commandRequest(
        harness,
        `/api/research/runs/${run.runId}/cancel`,
        "late-cancel",
      ),
    );

    // Then
    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({
      error: { code: "COMMAND_NOT_ALLOWED" },
    });
    expect(
      databaseScalar(
        harness,
        "SELECT report_id FROM runs WHERE run_id = ?",
        run.runId,
      ),
    ).toBe(publication.reportId);
  });
}
