import { describe, expect, it } from "vitest";
import { scrubEvent, scrubTransaction } from "./privacy";

describe("monitoring privacy", () => {
  it("removes request, user, SQL and question contents while retaining timings", () => {
    const event = scrubTransaction({
      type: "transaction",
      transaction: "GET /api/research/reports/private-id?question=secret",
      request: {
        cookies: { session: "secret" },
        data: "secret",
        headers: { authorization: "secret" },
      },
      user: { email: "secret" },
      extra: { question: "secret" },
      tags: { runId: "run-id", prompt: "secret" },
      breadcrumbs: [{ message: "secret" }],
      contexts: {
        trace: { trace_id: "a", span_id: "b", data: { question: "secret" } },
      },
      spans: [
        {
          start_timestamp: 1,
          timestamp: 2,
          trace_id: "a",
          span_id: "c",
          op: "db",
          description: "SELECT secret",
          data: { "db.statement": "secret" },
        },
      ],
    });
    expect(JSON.stringify(event)).not.toContain("secret");
    expect(event.transaction).toBe("/api/research/reports/:id");
    expect(event.spans?.[0]?.timestamp).toBe(2);
    expect(event.tags).toEqual({ runId: "run-id" });
  });

  it("keeps stack locations without leaking provider errors or local variables", () => {
    const event = scrubEvent({
      type: undefined,
      exception: {
        values: [
          {
            type: "Error",
            value: "secret",
            stacktrace: {
              frames: [
                {
                  filename: "worker.js",
                  lineno: 10,
                  vars: { prompt: "secret" },
                },
              ],
            },
          },
        ],
      },
    });
    expect(JSON.stringify(event)).not.toContain("secret");
    expect(event.exception?.values?.[0]?.stacktrace?.frames?.[0]?.lineno).toBe(
      10,
    );
  });
});
