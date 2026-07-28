import { afterEach, describe, expect, it, vi } from "vitest";
import { createResearchClient, ResearchClientConfigurationError } from "./api";

const RUN_ID = "00000000-0000-4000-8000-000000000001";
const SNAPSHOT_ID = "00000000-0000-4000-8000-000000000002";

function runResponse() {
  return {
    run: {
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      symbol: "NVDA",
      locale: "en",
      status: "queued",
      lastEventSeq: 1,
      createdAt: "2026-07-23T06:00:00.000Z",
    },
  } as const;
}

describe("research command client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("can be constructed during server rendering without issuing requests", async () => {
    // Given
    vi.stubGlobal("window", undefined);

    // When
    const client = createResearchClient();

    // Then
    await expect(client.bootstrapSession()).rejects.toBeInstanceOf(
      ResearchClientConfigurationError,
    );
  });

  it("posts the exact symbol and question for server-owned normalization", async () => {
    // Given
    const requests: Request[] = [];
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      requests.push(request.clone());
      return request.url.endsWith("/session")
        ? new Response(null, { status: 204 })
        : Response.json(runResponse(), { status: 202 });
    };
    const client = createResearchClient({
      prefixUrl: "http://localhost/",
      fetch,
    });

    // When
    const created = await client.startRun({
      symbol: " nvda ",
      question: "  What changed in margins?  ",
      locale: "en",
      idempotencyKey: "start-run-1",
    });

    // Then
    expect(created.run.runId).toBe(RUN_ID);
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/api/research/session",
      "/api/research/runs",
    ]);
    expect(await requests[1]?.json()).toEqual({
      symbol: " nvda ",
      question: "  What changed in margins?  ",
      locale: "en",
    });
    expect(requests[1]?.headers.get("idempotency-key")).toBe("start-run-1");
  });

  it("targets the root research API from a nested research page", async () => {
    // Given
    window.history.replaceState({}, "", "/research/NVDA?run=active");
    const requests: Request[] = [];
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      return new Response(null, { status: 204 });
    };
    const client = createResearchClient({ fetch });

    // When
    await client.bootstrapSession();

    // Then
    expect(requests[0] ? new URL(requests[0].url).pathname : undefined).toBe(
      "/api/research/session",
    );
  });

  it("rejects a malformed snapshot instead of admitting browser-local state", async () => {
    // Given
    const fetch: typeof globalThis.fetch = async () =>
      Response.json({
        run: { ...runResponse().run, lastEventSeq: "1" },
        events: [],
      });
    const client = createResearchClient({
      prefixUrl: "http://localhost/",
      fetch,
    });

    // When / Then
    await expect(client.getRun(RUN_ID)).rejects.toMatchObject({
      name: "ResearchPayloadError",
    });
  });

  it("sends cancellation and same-snapshot retry as idempotent commands", async () => {
    // Given
    const requests: Request[] = [];
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      requests.push(request.clone());
      return request.url.endsWith("/cancel")
        ? Response.json({ run: { runId: RUN_ID, status: "cancelling" } })
        : Response.json({
            run: {
              runId: RUN_ID,
              snapshotId: SNAPSHOT_ID,
              status: "queued",
              parentRunId: RUN_ID,
              lineage: "same-snapshot-retry",
            },
          });
    };
    const client = createResearchClient({
      prefixUrl: "http://localhost/",
      fetch,
    });

    // When
    await client.cancelRun(RUN_ID, "cancel-key");
    const child = await client.retryRun(RUN_ID, "retry-key");

    // Then
    expect(child.lineage).toBe("same-snapshot-retry");
    expect(
      requests.map((request) => request.headers.get("idempotency-key")),
    ).toEqual(["cancel-key", "retry-key"]);
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      `/api/research/runs/${RUN_ID}/cancel`,
      `/api/research/runs/${RUN_ID}/retries`,
    ]);
  });

  it("propagates follow-up and grounded-question bodies without adding facts", async () => {
    // Given
    const reportId = "00000000-0000-4000-8000-000000000003";
    const requests: Request[] = [];
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      requests.push(request.clone());
      return request.url.endsWith("/follow-ups")
        ? Response.json({
            run: {
              runId: RUN_ID,
              snapshotId: SNAPSHOT_ID,
              status: "queued",
              parentRunId: RUN_ID,
              lineage: "new-snapshot-follow-up",
              reportId,
              version: 2,
            },
          })
        : Response.json({
            question: {
              questionId: RUN_ID,
              reportId,
              reportVersionId: SNAPSHOT_ID,
              attemptOrdinal: 1,
              status: "pending",
              question: { en: "Why margins?", ko: "Why margins?" },
              createdAt: "2026-07-23T06:00:00.000Z",
            },
          });
    };
    const client = createResearchClient({
      prefixUrl: "http://localhost/",
      fetch,
    });

    // When
    await client.followUp({
      reportId,
      question: "Reassess margins",
      idempotencyKey: "follow-key",
    });
    await client.askQuestion({
      reportId,
      question: "Why margins?",
      locale: "en",
      idempotencyKey: "question-key",
    });

    // Then
    expect(await requests[0]?.json()).toEqual({ question: "Reassess margins" });
    expect(await requests[1]?.json()).toEqual({
      question: "Why margins?",
      locale: "en",
    });
  });
});
