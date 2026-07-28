import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  createLiveResearchApi,
  prepareLiveResearchRuntime,
} from "../../../src/research/server/api/liveResearchApi";
import { createResearchApi } from "../../../src/research/server/api/researchApi";
import { prepareWorkerRuntime } from "../../../src/research/worker/runtimeLifecycle";
import { seedPublishedReport } from "./researchReportRoute.testSupport";
import {
  type ApiHarness,
  createApiHarness,
  createRunRequest,
  json,
} from "./researchRoutes.testSupport";

const harnesses: ApiHarness[] = [];
type TestEnvironmentKey = "HOME" | "STOCKSEMBLY_DATA_DIR";

function readTestEnvironment(name: TestEnvironmentKey): string | undefined {
  const value: unknown = Reflect.get(process.env, name);
  return typeof value === "string" ? value : undefined;
}

function writeTestEnvironment(
  name: TestEnvironmentKey,
  value: string | undefined,
): void {
  if (value === undefined) Reflect.deleteProperty(process.env, name);
  else Reflect.set(process.env, name, value);
}

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
});

async function harness(
  readiness?: () => Promise<boolean>,
  disk?: () => Promise<number>,
): Promise<ApiHarness> {
  const value = await createApiHarness(readiness, disk);
  harnesses.push(value);
  return value;
}

describe("secure research routes", () => {
  it("bootstraps a same-origin local session without authentication", async () => {
    // Given
    const context = await harness();
    const request = context.request(
      "/api/research/session",
      { headers: { origin: context.allowedOrigin } },
      false,
    );

    // When
    const response = await context.api.bootstrapSessionResponse(request);

    // Then
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toMatch(
      /^stocksembly_local_session=[^;]+; Path=\/; HttpOnly; SameSite=Strict$/u,
    );
  });

  it.each([
    ["evil Host", { host: "evil.invalid" }],
    ["forwarded request", { "x-forwarded-host": "127.0.0.1:3000" }],
    ["cross-origin request", { origin: "http://evil.invalid" }],
  ] as const)("rejects a session bootstrap with %s", async (_case, headers) => {
    // Given
    const context = await harness();
    const request = context.request("/api/research/session", undefined, false);
    for (const [name, value] of Object.entries(headers))
      request.headers.set(name, value);

    // When
    const response = await context.api.bootstrapSessionResponse(request);

    // Then
    expect(response.status).toBe(403);
    expect(response.headers.has("set-cookie")).toBe(false);
  });

  it("uses the worker's canonical database when no data-directory override exists", async () => {
    // Given
    const root = await mkdtemp(join(tmpdir(), "stocksembly-api-worker-root-"));
    const previousHome = readTestEnvironment("HOME");
    const previousDataRoot = readTestEnvironment("STOCKSEMBLY_DATA_DIR");
    writeTestEnvironment("HOME", root);
    writeTestEnvironment("STOCKSEMBLY_DATA_DIR", undefined);

    try {
      // When
      const live = await prepareLiveResearchRuntime();
      const api = await createLiveResearchApi();
      try {
        const worker = await prepareWorkerRuntime();

        // Then
        expect(live.dataRoot).toBe(worker.dataDirectory);
        expect(live.databasePath).toBe(worker.databasePath);
      } finally {
        await api.close();
      }
    } finally {
      writeTestEnvironment("HOME", previousHome);
      writeTestEnvironment("STOCKSEMBLY_DATA_DIR", previousDataRoot);
      await rm(root, { recursive: true, force: true });
    }
  });
  it("creates a private first-boot identity and preserves cookie and bearer authentication across restart", async () => {
    // Given
    const first = await harness();
    const tokenPath = first.api.automationTokenPath;
    const token = (await readFile(tokenPath, "utf8")).trim();
    const cookie = first.cookie;
    await first.api.close();

    // When
    const restarted = await createResearchApi({
      dataRoot: first.root,
      databasePath: first.databasePath,
      allowedHost: first.allowedHost,
      allowedOrigin: first.allowedOrigin,
      readiness: () => Promise.resolve(true),
      availableDiskBytes: () => Promise.resolve(3 * 1024 * 1024 * 1024),
      now: () => "2026-07-23T06:01:00.000Z",
      createId: crypto.randomUUID,
    });
    const cookieResponse = await restarted.handle(
      new Request(`${first.allowedOrigin}/api/research/runs`, {
        headers: {
          host: first.allowedHost,
          cookie,
          "sec-fetch-site": "same-origin",
        },
      }),
    );
    const bearerResponse = await restarted.handle(
      new Request(`${first.allowedOrigin}/api/research/runs`, {
        headers: {
          host: first.allowedHost,
          authorization: `Bearer ${token}`,
        },
      }),
    );

    // Then
    expect((await stat(tokenPath)).mode & 0o777).toBe(0o600);
    expect((await lstat(tokenPath)).isSymbolicLink()).toBe(false);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(cookieResponse.status).toBe(200);
    expect(bearerResponse.status).toBe(200);
    await restarted.close();
  });

  it("invalidates cookie and bearer only on explicit rotation", async () => {
    // Given
    const context = await harness();
    const oldCookie = context.cookie;
    const oldToken = (
      await readFile(context.api.automationTokenPath, "utf8")
    ).trim();

    // When
    await context.api.rotateIdentity();
    const staleCookie = await context.api.handle(
      context.request("/api/research/runs", { headers: { cookie: oldCookie } }),
    );
    const staleBearer = await context.api.handle(
      context.request(
        "/api/research/runs",
        { headers: { authorization: `Bearer ${oldToken}` } },
        false,
      ),
    );
    const newCookie =
      (await context.api.bootstrapSession()).split(";", 1)[0] ?? "";
    const refreshed = await context.api.handle(
      context.request(
        "/api/research/runs",
        { headers: { cookie: newCookie } },
        false,
      ),
    );

    // Then
    expect(staleCookie.status).toBe(401);
    expect(staleBearer.status).toBe(401);
    expect(refreshed.status).toBe(200);
    expect(
      (await readFile(context.api.automationTokenPath, "utf8")).trim(),
    ).not.toBe(oldToken);
  });

  it("rejects symlinked or weakly permissioned token files", async () => {
    // Given
    const context = await harness();
    const path = context.api.automationTokenPath;
    const outside = join(context.root, "outside-token");
    await context.api.close();
    await writeFile(outside, Buffer.alloc(32).toString("base64url"), {
      mode: 0o600,
    });
    await rm(path);
    await symlink(outside, path);

    // When / Then
    await expect(
      createResearchApi({
        dataRoot: context.root,
        databasePath: context.databasePath,
        allowedHost: context.allowedHost,
        allowedOrigin: context.allowedOrigin,
        readiness: () => Promise.resolve(true),
        availableDiskBytes: () => Promise.resolve(3 * 1024 * 1024 * 1024),
      }),
    ).rejects.toBeInstanceOf(Error);
    await rm(path);
    await writeFile(path, Buffer.alloc(32).toString("base64url"), {
      mode: 0o644,
    });
    await chmod(path, 0o644);
    await expect(
      createResearchApi({
        dataRoot: context.root,
        databasePath: context.databasePath,
        allowedHost: context.allowedHost,
        allowedOrigin: context.allowedOrigin,
        readiness: () => Promise.resolve(true),
        availableDiskBytes: () => Promise.resolve(3 * 1024 * 1024 * 1024),
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it("atomically creates the run, collection job, public event, request metadata, and idempotency result", async () => {
    // Given
    const context = await harness();

    // When
    const response = await context.api.handle(
      createRunRequest(context, "create-1"),
    );
    const result = await json(response);
    const database = new Database(context.databasePath, { readonly: true });
    const counts = Object.fromEntries(
      [
        "runs",
        "snapshots",
        "jobs",
        "run_events",
        "research_requests",
        "idempotency_records",
      ].map((table) => [
        table,
        database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get(),
      ]),
    );
    database.close();

    // Then
    expect(response.status).toBe(202);
    expect(result).toMatchObject({
      run: { symbol: "NVDA", locale: "en", status: "queued", lastEventSeq: 1 },
    });
    expect(counts).toEqual(
      Object.fromEntries(Object.keys(counts).map((key) => [key, { count: 1 }])),
    );
    expect(JSON.stringify(result)).not.toMatch(
      /secret|token|prompt|reasoning|stdout|stderr/i,
    );
  });

  it("replays the original response for the same normalized payload and conflicts on a different payload", async () => {
    // Given
    const context = await harness();
    const first = await context.api.handle(
      createRunRequest(context, "same-key", {
        symbol: " nvda ",
        question: "  What   changed? ",
        locale: "en",
      }),
    );

    // When
    const replay = await context.api.handle(
      createRunRequest(context, "same-key", {
        symbol: "NVDA",
        question: "What changed?",
        locale: "en",
      }),
    );
    const conflict = await context.api.handle(
      createRunRequest(context, "same-key", {
        symbol: "AAPL",
        question: "What changed?",
        locale: "en",
      }),
    );

    // Then
    expect(replay.status).toBe(202);
    expect(await replay.text()).toBe(await first.text());
    expect(conflict.status).toBe(409);
    expect(await json(conflict)).toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });
  });

  it("returns the original idempotent result even when new-run admission later becomes unavailable", async () => {
    // Given
    let ready = true;
    let diskBytes = 3 * 1024 * 1024 * 1024;
    const context = await harness(
      () => Promise.resolve(ready),
      () => Promise.resolve(diskBytes),
    );
    const first = await context.api.handle(
      createRunRequest(context, "durable-replay"),
    );
    const firstBody = await first.text();
    ready = false;
    diskBytes = 0;

    // When
    const replay = await context.api.handle(
      createRunRequest(context, "durable-replay"),
    );
    const conflict = await context.api.handle(
      createRunRequest(context, "durable-replay", {
        symbol: "AAPL",
        question: "What changed in margins?",
        locale: "en",
      }),
    );

    // Then
    expect(replay.status).toBe(202);
    expect(await replay.text()).toBe(firstBody);
    expect(conflict.status).toBe(409);
  });

  it("ignores an unusable optional research direction and starts broad research", async () => {
    // Given
    const context = await harness();

    // When
    const response = await context.api.handle(
      createRunRequest(context, "ignored-direction", {
        symbol: "NVDA",
        question: "x".repeat(101),
        locale: "en",
      }),
    );
    const database = new Database(context.databasePath, { readonly: true });
    const stored = database
      .prepare("SELECT question FROM research_requests ORDER BY rowid DESC")
      .pluck()
      .get();
    database.close();

    // Then
    expect(response.status).toBe(202);
    expect(stored).toBe("");
  });

  it.each([
    [{ symbol: "N/VDA", question: "q", locale: "en" }, 400, "SYMBOL_INVALID"],
    [
      { symbol: "ZZZZ", question: "q", locale: "en" },
      400,
      "SYMBOL_UNSUPPORTED",
    ],
    [{ symbol: "SPY", question: "q", locale: "en" }, 400, "ETF_UNSUPPORTED"],
    [{ symbol: "BRK", question: "q", locale: "en" }, 409, "SYMBOL_AMBIGUOUS"],
    [{ symbol: "NVDA", question: "q", locale: "fr" }, 400, "REQUEST_INVALID"],
  ])("rejects invalid research input %#", async (body, status, code) => {
    // Given
    const context = await harness();

    // When
    const response = await context.api.handle(
      createRunRequest(context, `invalid-${code}`, body),
    );

    // Then
    expect(response.status).toBe(status);
    expect(await json(response)).toMatchObject({ error: { code } });
  });

  it.each(["META", "AMD", "BRK-B"])(
    "admits a catalog-backed US-listed stock outside the former fixed list: %s",
    async (symbol) => {
      // Given
      const context = await harness();

      // When
      const response = await context.api.handle(
        createRunRequest(context, `listed-${symbol}`, {
          symbol,
          question: "Assess the investment case.",
          locale: "en",
        }),
      );

      // Then
      expect(response.status).toBe(202);
      expect(await json(response)).toMatchObject({
        run: { symbol, status: "queued" },
      });
    },
  );

  it("enforces content type, 64-KiB body, exact origin, fetch metadata, idempotency-key length, and no CORS preflight", async () => {
    // Given
    const context = await harness();
    const plain = createRunRequest(context, "plain");
    const oversized = createRunRequest(context, "large", {
      symbol: "NVDA",
      question: "x".repeat(65_537),
      locale: "en",
    });
    const crossOrigin = createRunRequest(context, "cross");
    const crossSite = createRunRequest(context, "site");
    const longKey = createRunRequest(context, "x".repeat(129));

    // When
    plain.headers.set("content-type", "text/plain");
    crossOrigin.headers.set("origin", "http://evil.invalid");
    crossSite.headers.set("sec-fetch-site", "cross-site");
    const responses = await Promise.all([
      context.api.handle(plain),
      context.api.handle(oversized),
      context.api.handle(crossOrigin),
      context.api.handle(crossSite),
      context.api.handle(longKey),
      context.api.handle(
        context.request("/api/research/runs", { method: "OPTIONS" }),
      ),
    ]);

    // Then
    expect(responses.map((response) => response.status)).toEqual([
      415, 413, 403, 403, 400, 403,
    ]);
    expect(
      responses.every(
        (response) => !response.headers.has("access-control-allow-origin"),
      ),
    ).toBe(true);
  });

  it("rejects public, evil, DNS-rebinding, forwarded, unauthenticated, and stale credentials without creating rows", async () => {
    // Given
    const context = await harness();
    const requests = [
      createRunRequest(context, "public"),
      createRunRequest(context, "evil"),
      createRunRequest(context, "dns"),
      createRunRequest(context, "forwarded"),
      createRunRequest(context, "anonymous"),
      createRunRequest(context, "stale"),
    ];
    requests[0]?.headers.set("host", "0.0.0.0:3000");
    requests[1]?.headers.set("host", "evil.invalid");
    requests[2]?.headers.set("host", "127.0.0.1.evil.invalid:3000");
    requests[3]?.headers.set("x-forwarded-host", context.allowedHost);
    requests[4]?.headers.delete("cookie");
    requests[5]?.headers.set("cookie", "stocksembly_session=stale");

    // When
    const responses = await Promise.all(
      requests.map((request) => context.api.handle(request)),
    );
    const database = new Database(context.databasePath, { readonly: true });
    const count = database.prepare("SELECT COUNT(*) AS count FROM runs").get();
    database.close();

    // Then
    expect(responses.map((response) => response.status)).toEqual([
      403, 403, 403, 403, 401, 401,
    ]);
    expect(count).toEqual({ count: 0 });
  });

  it("returns 503 for unready Codex or a full queue and 507 for low disk without partial rows", async () => {
    // Given
    const unready = await harness(() => Promise.resolve(false));
    const lowDisk = await harness(undefined, () =>
      Promise.resolve(2_147_483_647),
    );
    const full = await harness();
    for (let index = 0; index < 8; index += 1) {
      const response = await full.api.handle(
        createRunRequest(full, `fill-${index}`),
      );
      expect(response.status).toBe(202);
    }

    // When
    const responses = await Promise.all([
      unready.api.handle(createRunRequest(unready, "unready")),
      lowDisk.api.handle(createRunRequest(lowDisk, "disk")),
      full.api.handle(createRunRequest(full, "full")),
    ]);

    // Then
    expect(responses.map((response) => response.status)).toEqual([
      503, 507, 503,
    ]);
    expect(await json(responses[0] ?? new Response())).toMatchObject({
      error: { code: "RESEARCH_UNREADY" },
    });
    expect(await json(responses[1] ?? new Response())).toMatchObject({
      error: { code: "DISK_LOW" },
    });
    expect(await json(responses[2] ?? new Response())).toMatchObject({
      error: { code: "QUEUE_FULL" },
    });
  });

  it("paginates principal-owned history and keeps GET run/report queries side-effect free and public-only", async () => {
    // Given
    const context = await harness();
    const first = await context.api.handle(
      createRunRequest(context, "history-1"),
    );
    const second = await context.api.handle(
      createRunRequest(context, "history-2", {
        symbol: "AAPL",
        question: "Risks?",
        locale: "ko",
      }),
    );
    const firstBody = (await json(first)) as {
      readonly run: { readonly runId: string };
    };
    await json(second);
    const database = new Database(context.databasePath);
    database.transaction(() => {
      database
        .prepare("UPDATE runs SET last_event_seq = 2 WHERE run_id = ?")
        .run(firstBody.run.runId);
      database
        .prepare(`INSERT INTO run_events(
        run_id, sequence, event_id, event_type, state_id, occurred_at, payload_json
      ) VALUES (?, 2, ?, 'spawn_reserved', 'internal', ?, ?)`)
        .run(
          firstBody.run.runId,
          randomUUID(),
          "2026-07-23T06:01:00.000Z",
          JSON.stringify({ reasoning: "private chain of thought" }),
        );
    })();
    database.close();
    const before = (await stat(context.databasePath)).mtimeMs;

    // When
    const pageOne = await context.api.handle(
      context.request("/api/research/runs?limit=1"),
    );
    const pageOneBody = (await json(pageOne)) as {
      readonly nextCursor: string;
      readonly runs: readonly { readonly symbol: string }[];
    };
    const pageTwo = await context.api.handle(
      context.request(
        `/api/research/runs?limit=1&cursor=${encodeURIComponent(pageOneBody.nextCursor)}`,
      ),
    );
    const detail = await context.api.handle(
      context.request(`/api/research/runs/${firstBody.run.runId}`),
    );
    const detailBody = await json(detail);
    const missingReport = await context.api.handle(
      context.request(
        "/api/research/reports/00000000-0000-4000-8000-000000000099",
      ),
    );
    const after = (await stat(context.databasePath)).mtimeMs;

    // Then
    expect(pageOne.status).toBe(200);
    expect(pageTwo.status).toBe(200);
    const pageTwoBody = (await json(pageTwo)) as {
      readonly runs: readonly { readonly symbol: string }[];
    };
    expect(
      new Set([pageOneBody.runs[0]?.symbol, pageTwoBody.runs[0]?.symbol]),
    ).toEqual(new Set(["NVDA", "AAPL"]));
    expect(detailBody).toMatchObject({
      run: { runId: firstBody.run.runId },
      events: [{ kind: "run_created" }],
    });
    expect(
      (detailBody as { readonly events: readonly unknown[] }).events,
    ).toHaveLength(1);
    expect(missingReport.status).toBe(404);
    expect(after).toBe(before);
    expect(JSON.stringify(detailBody)).not.toMatch(
      /inputHash|lease|principal|question|token|secret/i,
    );
  });

  it("loads the authenticated public report artifact without exposing persistence fields", async () => {
    // Given
    const context = await harness();
    const created = await context.api.handle(
      createRunRequest(context, "report-query"),
    );
    const createdBody = (await json(created)) as {
      readonly run: { readonly runId: string; readonly snapshotId: string };
    };
    const seeded = await seedPublishedReport(context, createdBody.run);

    // When
    const response = await context.api.handle(
      context.request(`/api/research/reports/${seeded.reportId}`),
    );
    const body = await json(response);

    // Then
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      report: {
        reportId: seeded.reportId,
        runId: createdBody.run.runId,
        locales: {
          en: { sections: expect.any(Array) },
          ko: { sections: expect.any(Array) },
        },
        dataCoverage: [
          expect.objectContaining({
            dataset: "sec_filing",
            status: "available",
          }),
          expect.objectContaining({
            dataset: "insightsentry_request_ledger",
            status: "unavailable",
            limitation: "subscription_required",
          }),
        ],
        providerDisagreements: [
          expect.objectContaining({
            authoritativeSource: "sec_company_facts",
            comparedSource: "insightsentry_rapidapi",
          }),
        ],
      },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /content_hash|public_payload_json|principal_id|input_hash|lease_owner/i,
    );
  });
});
