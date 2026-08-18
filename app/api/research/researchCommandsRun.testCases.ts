import { expect, it } from "vitest";
import { z } from "zod";
import {
  commandRequest,
  createRun,
  databaseScalar,
  interruptInitialResearchJob,
  postCommand,
  publishRun,
  setInitialResearchJobRetry,
  setInitialResearchJobStatus,
  setResearchTarget,
  setRunStatus,
} from "./researchCommands.testSupport";
import type { ApiHarness } from "./researchRoutes.testSupport";
import { json } from "./researchRoutes.testSupport";

export function registerResearchRunCommandTests(
  harnessValue: () => ApiHarness,
): void {
  it("resumes the failed stage in place without creating another run", async () => {
    // Given
    const harness = harnessValue();
    const parent = await createRun(harness, "retry-parent");
    setInitialResearchJobStatus(harness, parent.runId, "retry-wait");
    setInitialResearchJobRetry(harness, parent.runId, {
      retryAt: "2099-01-01T00:00:00.000Z",
      failureCount: 5,
      circuitOpen: true,
    });
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
        runId: parent.runId,
        snapshotId: parent.snapshotId,
        status: "running",
        recovery: "same-run-stage-resume",
      },
    });
    expect(
      databaseScalar(
        harness,
        "SELECT status FROM runs WHERE run_id = ?",
        parent.runId,
      ),
    ).toBe("running");
    expect(databaseScalar(harness, "SELECT COUNT(*) FROM runs")).toBe(1);
    expect(
      databaseScalar(
        harness,
        `SELECT json_extract(result_json, '$.retryAt')
         FROM idempotency_records WHERE scope = 'worker-retry'`,
      ),
    ).toBe("2026-07-23T06:00:00.000Z");
    expect(
      databaseScalar(
        harness,
        `SELECT json_extract(result_json, '$.failureCount')
         FROM idempotency_records WHERE scope = 'worker-retry'`,
      ),
    ).toBe(0);
    expect(
      databaseScalar(
        harness,
        `SELECT json_extract(result_json, '$.circuitOpen')
         FROM idempotency_records WHERE scope = 'worker-retry'`,
      ),
    ).toBe(0);
  });

  it("preserves a department target on same-snapshot retry", async () => {
    const harness = harnessValue();
    const parent = await createRun(harness, "retry-department-parent");
    setResearchTarget(harness, parent.runId, "market");
    setInitialResearchJobStatus(harness, parent.runId, "retry-wait");
    setRunStatus(harness, parent.runId, "failed");

    const created = await postCommand(
      harness,
      `/api/research/runs/${parent.runId}/retries`,
      "retry-department-child",
    );
    const resumedRunId = z
      .object({ run: z.object({ runId: z.string().uuid() }) })
      .parse(created.body).run.runId;

    expect(created.response.status).toBe(202);
    expect(
      databaseScalar(
        harness,
        `SELECT research_kind || ':' || department_id
         FROM research_requests WHERE run_id = ?`,
        resumedRunId,
      ),
    ).toBe("department:market");
    expect(resumedRunId).toBe(parent.runId);
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

  it("rejects a terminal job failure instead of leaving the run stuck", async () => {
    const harness = harnessValue();
    const run = await createRun(harness, "retry-terminal-failure");
    setInitialResearchJobStatus(harness, run.runId, "failed");
    setRunStatus(harness, run.runId, "failed");

    const response = await harness.api.handle(
      commandRequest(
        harness,
        `/api/research/runs/${run.runId}/retries`,
        "retry-terminal-failure-command",
      ),
    );

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({
      error: { code: "RECOVERY_NOT_AVAILABLE" },
    });
    expect(
      databaseScalar(
        harness,
        "SELECT status FROM runs WHERE run_id = ?",
        run.runId,
      ),
    ).toBe("failed");
  });

  it("reopens a failed job when its persisted failure is transient", async () => {
    const harness = harnessValue();
    const run = await createRun(harness, "retry-transient-terminal");
    setInitialResearchJobStatus(harness, run.runId, "failed");
    setInitialResearchJobRetry(harness, run.runId, {
      retryAt: "2099-01-01T00:00:00.000Z",
      failureCount: 3,
      circuitOpen: true,
    });
    setRunStatus(harness, run.runId, "incomplete");

    const response = await harness.api.handle(
      commandRequest(
        harness,
        `/api/research/runs/${run.runId}/retries`,
        "retry-transient-terminal-command",
      ),
    );

    expect(response.status).toBe(202);
    expect(
      databaseScalar(
        harness,
        "SELECT status FROM jobs WHERE run_id = ? AND kind = 'research'",
        run.runId,
      ),
    ).toBe("retry-wait");
    expect(
      databaseScalar(
        harness,
        `SELECT json_extract(result_json, '$.circuitOpen')
         FROM idempotency_records WHERE scope = 'worker-retry'`,
      ),
    ).toBe(0);
  });

  it.each(["spawn-reserved", "running"] as const)(
    "invalidates an interrupted %s attempt before resuming the same run",
    async (interruptedStatus) => {
      const harness = harnessValue();
      const run = await createRun(harness, `retry-${interruptedStatus}`);
      const attemptId = interruptInitialResearchJob(
        harness,
        run.runId,
        interruptedStatus,
      );
      setRunStatus(harness, run.runId, "incomplete");

      const response = await harness.api.handle(
        commandRequest(
          harness,
          `/api/research/runs/${run.runId}/retries`,
          `retry-${interruptedStatus}-command`,
        ),
      );

      expect(response.status).toBe(202);
      expect(
        databaseScalar(
          harness,
          "SELECT status FROM attempts WHERE attempt_id = ?",
          attemptId,
        ),
      ).toBe("unknown");
      expect(
        databaseScalar(
          harness,
          "SELECT status FROM jobs WHERE run_id = ? AND kind = 'research'",
          run.runId,
        ),
      ).toBe("retry-wait");
      expect(
        databaseScalar(
          harness,
          "SELECT lease_owner FROM jobs WHERE run_id = ? AND kind = 'research'",
          run.runId,
        ),
      ).toBeNull();
    },
  );

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
