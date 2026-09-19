import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const [
  target = "http://localhost:3119",
  rawCount = "2",
  output = "/tmp/stocksembly-landing-browsers.json",
] = process.argv.slice(2);
if (target === "--help") {
  console.log(
    "Usage: node scripts/performance/landing-browsers.mjs URL COUNT OUTPUT.json\nNon-loopback URLs require ALLOW_PRODUCTION_LOAD=1. No research is created.",
  );
  process.exit(0);
}
const url = new URL(target);
const count = Number(rawCount);
if (!Number.isInteger(count) || count < 1 || count > 100)
  throw new Error("COUNT must be 1..100");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
  process.env.ALLOW_PRODUCTION_LOAD !== "1"
)
  throw new Error(
    "Set ALLOW_PRODUCTION_LOAD=1 to explicitly enable remote load",
  );
const browser = await chromium.launch({ headless: true });
try {
  const pages = await Promise.all(
    Array.from({ length: count }, async () => {
      const context = await browser.newContext({
        userAgent: "StocksemblyLoadTest Chromium",
        viewport: { width: 1440, height: 900 },
      });
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.__landingLcp = null;
        new PerformanceObserver((list) => {
          window.__landingLcp = list.getEntries().at(-1)?.startTime ?? null;
        }).observe({ type: "largest-contentful-paint", buffered: true });
      });
      return page;
    }),
  );
  const startedAt = new Date().toISOString();
  const results = await Promise.all(
    pages.map(async (page, index) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        const response = await page.goto(url.href, {
          waitUntil: "load",
          timeout: 60000,
        });
        await page.waitForTimeout(5000);
        return {
          visitor: index + 1,
          status: response?.status(),
          errors,
          ...(await page.evaluate(() => {
            const nav = performance.getEntriesByType("navigation")[0];
            return {
              ttfbMs: nav?.responseStart,
              loadMs: nav?.loadEventEnd,
              fcpMs:
                performance.getEntriesByName("first-contentful-paint")[0]
                  ?.startTime ?? null,
              lcpCandidateMs: window.__landingLcp,
            };
          })),
        };
      } catch (error) {
        return { visitor: index + 1, error: String(error), errors };
      }
    }),
  );
  results.sort((a, b) => (b.loadMs ?? Infinity) - (a.loadMs ?? Infinity));
  await writeFile(
    output,
    JSON.stringify(
      {
        target: url.href,
        startedAt,
        browser: browser.version(),
        count,
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      {
        output,
        count,
        failed: results.filter((r) => r.error || r.status !== 200).length,
        slowestTen: results.slice(0, 10),
      },
      null,
      2,
    ),
  );
  if (results.some((r) => r.error || r.status !== 200)) process.exitCode = 1;
} finally {
  await browser.close();
}
