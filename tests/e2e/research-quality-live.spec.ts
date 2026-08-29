import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  LiveLedgerSchema,
  TranslationProofSchema,
  publishedLedgerEntries,
} from "../../scripts/run-research-quality-live";

const BOUNDED_FAILURE_LEDGER_INPUT = {
  schemaVersion: 2,
  invocationId: "b10ab28a-5725-41aa-9979-4db90d76a328",
  createdAt: "2026-08-29T13:23:05.000Z",
  immutable: true,
  passed: false,
  outcome: "bounded_failure_report",
  entries: [
    {
      symbol: "NVDA",
      runId: "61c00dab-a18b-4827-ad60-5a7e7655fcb3",
      terminalStatus: "failed",
      terminalReason: "codex_policy_violation",
      chargeDisposition: "not_charged",
      reportId: null,
      reportUrl: null,
      score: null,
      scoreStatus: "not_computable",
      scorecardPath: "/tmp/nvda-scorecard.json",
    },
    {
      symbol: "TSLA",
      runId: "2c03eeb5-7575-4304-8afd-450e82a27725",
      terminalStatus: "incomplete",
      terminalReason: "chair_synthesis:replacement_exhausted",
      chargeDisposition: "not_charged",
      reportId: null,
      reportUrl: null,
      score: null,
      scoreStatus: "not_computable",
      scorecardPath: "/tmp/tsla-scorecard.json",
    },
  ],
  browserProof: {
    status: "skipped_no_published_reports",
    runIds: [],
  },
  translationProof: null,
} as const;

test("marks terminal failures as not computable and unpublished", () => {
  // Given: a schema-versioned ledger containing the two bounded terminal failures.
  const ledger = LiveLedgerSchema.parse(BOUNDED_FAILURE_LEDGER_INPUT);

  // When: the browser-eligible entries are selected.
  const published = publishedLedgerEntries(ledger);

  // Then: neither failed run can be presented as a report or passing score.
  expect(published).toEqual([]);
  expect(ledger.entries.every((entry) => entry.score === null)).toBe(true);
});

test("rejects a passing claim when bounded entries are not computable", () => {
  // Given: the bounded failure ledger with only its top-level pass claim changed.
  const invalidPassClaim = { ...BOUNDED_FAILURE_LEDGER_INPUT, passed: true };

  // When: the cross-field ledger contract parses the contradictory claim.
  const parsed = LiveLedgerSchema.safeParse(invalidPassClaim);

  // Then: the contradictory pass claim is rejected.
  expect(parsed.success).toBe(false);
});

test("rejects meaningless translation proof placeholders", () => {
  // Given: a report-bound cache key with contradictory placeholder evidence.
  const meaninglessProof = {
    cacheKey: {
      reportId: "f5d05078-7bfd-4333-b535-84b6378ac7a4",
      reportVersion: 1,
      sourceContentHash: "a".repeat(64),
      sourceLocale: "en",
      targetLocale: "ko",
      translationSchemaVersion: 2,
      modelVersion: "gpt-5.6",
    },
    expectedBatchCount: 999,
    batches: [null],
    counterSnapshots: null,
    durableRows: [null],
  };

  // When: the translation proof boundary parses the placeholder evidence.
  const parsed = TranslationProofSchema.safeParse(meaninglessProof);

  // Then: null placeholders and contradictory counts are rejected.
  expect(parsed.success).toBe(false);
});

test("renders both bounded live quality reports with working sources", async ({
  browser,
}) => {
  test.skip(process.env["RUN_LIVE_RESEARCH"] !== "1");
  test.setTimeout(600_000);
  const ledgerPath = process.env["QUALITY_RUN_LEDGER"];
  const tokenPath = process.env["RESEARCH_AUTOMATION_TOKEN_PATH"];
  const evidenceInput = process.env["RESEARCH_QUALITY_EVIDENCE_DIR"];
  const baseUrl = process.env["PLAYWRIGHT_BASE_URL"];
  if (
    ledgerPath === undefined ||
    tokenPath === undefined ||
    evidenceInput === undefined
  )
    throw new TypeError("LIVE_RESEARCH_BROWSER_INPUTS_REQUIRED");
  const ledger = LiveLedgerSchema.parse(
    JSON.parse(await readFile(ledgerPath, "utf8")),
  );
  expect(ledger.entries.map(({ symbol }) => symbol)).toEqual(["NVDA", "TSLA"]);
  const evidenceDir = path.resolve(evidenceInput);
  const publishedEntries = publishedLedgerEntries(ledger);
  if (publishedEntries.length === 0) {
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(
      path.join(
        evidenceDir,
        `browser-observations-${ledger.invocationId}-${randomUUID()}.json`,
      ),
      `${JSON.stringify(
        {
          schemaVersion: 2,
          ledgerInvocationId: ledger.invocationId,
          passed: false,
          status: "skipped_no_published_reports",
          reason: "The exact ledger run IDs published no reports.",
          observations: [],
        },
        null,
        2,
      )}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    return;
  }
  if (baseUrl === undefined)
    throw new TypeError("PLAYWRIGHT_BASE_URL_REQUIRED_FOR_PUBLISHED_REPORTS");
  const token = (await readFile(tokenPath, "utf8")).trim();
  await mkdir(path.join(evidenceDir, "screenshots"), { recursive: true });
  await mkdir(path.join(evidenceDir, "traces"), { recursive: true });
  const browserProofId = randomUUID();
  const observations: Array<Record<string, unknown>> = [];

  for (const entry of publishedEntries) {
    // Given: the immutable live ledger and dedicated local automation principal.
    const context = await browser.newContext({
      baseURL: baseUrl,
      viewport: { width: 1440, height: 900 },
      extraHTTPHeaders: { authorization: `Bearer ${token}` },
    });
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    expect((await context.request.get("/api/research/session")).status()).toBe(
      204,
    );
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    // When: the published report is opened through the normal browser reader.
    await page.goto(entry.reportUrl, { waitUntil: "networkidle" });

    // Then: the report and two ledger-bound source links are rendered and reachable.
    const surface = page.locator("[data-report-surface]");
    await expect(surface).toBeVisible({ timeout: 120_000 });
    await expect(page.locator("main")).not.toBeEmpty();
    const publicText = await page.locator("main").innerText();
    expect(publicText).not.toMatch(/wait_for_proof|internal recovery/iu);
    const sourceResults = [];
    for (const sourceUrl of entry.sourceUrls.slice(0, 2)) {
      const renderedLinkCount = await page
        .locator("a")
        .evaluateAll(
          (anchors, expectedUrl) =>
            anchors.filter(
              (anchor) => anchor.getAttribute("href") === expectedUrl,
            ).length,
          sourceUrl,
        );
      expect(renderedLinkCount).toBeGreaterThan(0);
      const response = await context.request.get(sourceUrl, {
        timeout: 30_000,
      });
      expect(response.status()).toBeLessThan(500);
      sourceResults.push({ url: sourceUrl, status: response.status() });
    }
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    const screenshotPath = path.join(
      evidenceDir,
      "screenshots",
      `${entry.symbol}-${entry.runId}-${browserProofId}.png`,
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const tracePath = path.join(
      evidenceDir,
      "traces",
      `${entry.symbol}-${entry.runId}-${browserProofId}.zip`,
    );
    await context.tracing.stop({ path: tracePath });
    observations.push({
      symbol: entry.symbol,
      reportUrl: entry.reportUrl,
      screenshotPath,
      tracePath,
      sourceResults,
      consoleErrors,
      pageErrors,
    });
    await context.close();
  }
  await writeFile(
    path.join(
      evidenceDir,
      `browser-observations-${ledger.invocationId}-${browserProofId}.json`,
    ),
    `${JSON.stringify(
      {
        passed: publishedEntries.length === ledger.entries.length,
        status:
          publishedEntries.length === ledger.entries.length
            ? "all_published_reports_observed"
            : "partial_published_reports_observed",
        observations,
      },
      null,
      2,
    )}\n`,
    { encoding: "utf8", flag: "wx" },
  );
});
