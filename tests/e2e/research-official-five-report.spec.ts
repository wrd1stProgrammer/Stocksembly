import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

type LedgerEntry = {
  readonly surface: "committee" | "market" | "company" | "financial" | "risk";
  readonly symbol: string;
  readonly runId: string;
  readonly reportId: string;
};

const evidenceDir = path.resolve(
  process.env["RESEARCH_REDESIGN_EVIDENCE_DIR"] ??
    ".omo/evidence/task-13-research-editorial-system-rebuild",
);

async function officialInputs(): Promise<{
  entries: readonly LedgerEntry[];
  authorization: string;
}> {
  const ledgerPath = process.env["OFFICIAL_RUN_LEDGER"];
  const tokenPath = process.env["RESEARCH_AUTOMATION_TOKEN_PATH"];
  if (ledgerPath === undefined || tokenPath === undefined)
    throw new Error("OFFICIAL_BROWSER_INPUTS_REQUIRED");
  const ledger = JSON.parse(await readFile(ledgerPath, "utf8")) as {
    entries: LedgerEntry[];
  };
  const token = (await readFile(tokenPath, "utf8")).trim();
  expect(ledger.entries).toHaveLength(5);
  expect(new Set(ledger.entries.map((entry) => entry.surface)).size).toBe(5);
  return { entries: ledger.entries, authorization: `Bearer ${token}` };
}

const chromeViewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
] as const;

test("captures and exercises all official decision-report surfaces", async ({
  browser,
  browserName,
}) => {
  test.setTimeout(180_000);
  const { entries, authorization } = await officialInputs();
  const engine = browserName === "webkit" ? "webkit" : "chrome";
  const viewports =
    engine === "webkit"
      ? [{ name: "desktop", width: 1440, height: 900 } as const]
      : chromeViewports;
  const observations: Record<string, unknown>[] = [];

  for (const entry of entries) {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        extraHTTPHeaders: {
          authorization,
        },
      });
      const sessionResponse = await context.request.get(
        "/api/research/session",
      );
      expect(sessionResponse.status()).toBe(204);
      const page = await context.newPage();
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto(`/research/${entry.symbol}?run=${entry.runId}&lang=ko`, {
        waitUntil: "networkidle",
      });
      const surface = page.locator(`[data-report-surface="${entry.surface}"]`);
      await expect(surface).toBeVisible({ timeout: 60_000 });
      await expect(page.locator("main")).not.toBeEmpty();
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(1);

      if (viewport.name === "tablet") {
        const workbenchWidth = await page
          .locator(".office-workbench")
          .evaluate((element) => element.getBoundingClientRect().width);
        expect(workbenchWidth).toBeGreaterThanOrEqual(600);
      }
      if (viewport.name === "mobile") {
        const workbenchWidth = await page
          .locator(".office-workbench")
          .evaluate((element) => element.getBoundingClientRect().width);
        expect(workbenchWidth).toBeGreaterThanOrEqual(350);
      }

      if (viewport.name === "desktop") {
        await page.evaluate(() =>
          (document.activeElement as HTMLElement | null)?.blur(),
        );
        await page.keyboard.press("Tab");
        const focused = page.locator(":focus");
        await expect(focused).toBeVisible();
        expect(
          await page.evaluate(() => document.activeElement?.tagName),
        ).not.toBe("BODY");
        await page.getByRole("button", { name: "다크" }).click();
        await expect(surface).toHaveAttribute("data-report-theme", "dark");
        const moreQuestions = page.locator("details[data-qa-expandable-count]");
        if ((await moreQuestions.count()) > 0) {
          await moreQuestions.locator("summary").click();
          await expect(moreQuestions).toHaveAttribute("open", "");
        }
        const sources = page.locator("details[data-committee-sources]");
        if ((await sources.count()) > 0) {
          await sources.locator("summary").click();
          await expect(sources).toHaveAttribute("open", "");
        }
        const publicText = await page.locator("main").innerText();
        expect(publicText).not.toMatch(
          /InsightSentry|RapidAPI|라이선스 시장 데이터|제공된 증거|_[a-z0-9]{8}\b/iu,
        );
        const questions = await page
          .locator('[data-report-section="anticipated-qa"] h3')
          .allTextContents();
        expect(questions).toHaveLength(10);
        expect(new Set(questions).size).toBe(10);
        if (entry.surface === "committee")
          expect(publicText).not.toMatch(/-?\d+\.\d{3,}%/u);
        if (entry.surface === "financial" || entry.surface === "risk") {
          const directAnswer = await page
            .locator(".research-editorial-cover__answer p")
            .innerText();
          await expect(
            page.locator('[data-report-section="debate"]'),
          ).not.toContainText(directAnswer);
        }
        const pdf = page.getByRole("link", { name: "PDF 다운로드" });
        await expect(pdf).toHaveAttribute(
          "href",
          `/api/research/reports/${entry.reportId}/pdf?lang=ko`,
        );
        const pdfResponse = await context.request.get(
          `/api/research/reports/${entry.reportId}/pdf?lang=ko`,
        );
        expect(pdfResponse.ok()).toBe(true);
        expect(pdfResponse.headers()["content-type"]).toContain(
          "application/pdf",
        );
        await expect(
          page.getByRole("button", { name: "리서치 룸 다시 보기" }),
        ).toBeEnabled();
      }

      await page.screenshot({
        path: path.join(
          evidenceDir,
          "screenshots",
          `${entry.surface}-${engine}-${viewport.name}.png`,
        ),
        fullPage: true,
      });
      observations.push({
        surface: entry.surface,
        engine,
        viewport: viewport.name,
        overflow: 0,
        consoleErrors,
        pageErrors,
      });
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
      await context.close();
    }
  }

  await test.info().attach(`${engine}-observations`, {
    body: Buffer.from(`${JSON.stringify(observations, null, 2)}\n`),
    contentType: "application/json",
  });
  const observationsDir = path.join(evidenceDir, "browser-observations");
  await mkdir(observationsDir, { recursive: true });
  await writeFile(
    path.join(observationsDir, `${engine}.json`),
    `${JSON.stringify(observations, null, 2)}\n`,
    "utf8",
  );
});
