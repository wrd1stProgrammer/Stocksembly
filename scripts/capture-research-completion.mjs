import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const evidenceDirectory =
  process.env.CAPTURE_EVIDENCE_DIR ?? ".omo/evidence/research-completion";
const baseUrl = process.env.CAPTURE_URL ?? "http://127.0.0.1:4175";
const viewports = [
  { name: "desktop", width: 1374, height: 1145 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];
const requestedViewport = process.env.CAPTURE_VIEWPORT ?? "desktop";
const requestedState = process.env.CAPTURE_STATE ?? "complete";
const requestedMode = process.env.CAPTURE_MODE ?? "fixture";
const requestedLocale = process.env.CAPTURE_LOCALE ?? "en";
const viewport =
  viewports.find((item) => item.name === requestedViewport) ?? viewports[0];

await mkdir(evidenceDirectory, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({
  viewport: { width: viewport.width, height: viewport.height },
  deviceScaleFactor: 1,
});
const browserErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(message.text());
});
page.on("pageerror", (error) => browserErrors.push(error.message));
await page.goto(`${baseUrl}/research/NVDA?lang=${requestedLocale}`);
await page.evaluate(() => document.fonts.ready);
await page.locator(".office-stage canvas").waitFor({ state: "visible" });
await page
  .locator('.office-game[data-render-actor-count="11"]')
  .waitFor({ state: "attached" });

async function paintedCanvas() {
  await page.waitForFunction(
    () =>
      Number(
        document
          .querySelector(".office-game")
          ?.getAttribute("data-render-frame-count") ?? 0,
      ) >= 2,
  );
  const image = PNG.sync.read(
    await page.locator(".office-stage canvas").screenshot(),
  );
  const colors = new Set();
  let nonBlackPixels = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const red = image.data[offset] ?? 0;
    const green = image.data[offset + 1] ?? 0;
    const blue = image.data[offset + 2] ?? 0;
    colors.add((red << 16) | (green << 8) | blue);
    if (red + green + blue > 36) nonBlackPixels += 1;
  }
  if (
    nonBlackPixels <= image.width * image.height * 0.02 ||
    colors.size <= 16
  ) {
    throw new Error("PIXEL_OFFICE_CANVAS_NOT_PAINTED");
  }
  return {
    width: image.width,
    height: image.height,
    nonBlackPixels,
    distinctColors: colors.size,
  };
}

const initialPaint = await paintedCanvas();
if (
  requestedMode === "fixture" &&
  (requestedState === "complete" || requestedState === "question")
) {
  await page.evaluate(() => {
    const bridge = window.__STOCKSEMBLY_RESEARCH_TEST__;
    if (bridge?.mode !== "fixture") {
      throw new Error("FIXTURE_COMPOSITION_REQUIRED");
    }
    bridge.skip();
  });
  await page
    .locator("[data-testid='public-ledger'][data-complete='true']")
    .waitFor();
}
if (requestedState === "complete") {
  await page.getByRole("heading", { name: /NVDA · v1\.0/ }).waitFor();
}
const completePaint =
  requestedState === "complete" ? await paintedCanvas() : null;

if (requestedState === "motion") {
  await page.screenshot({
    path: `${evidenceDirectory}/${viewport.name}-transition-start.png`,
    fullPage: false,
  });
  await page.waitForTimeout(120);
  await page.screenshot({
    path: `${evidenceDirectory}/${viewport.name}-transition-mid.png`,
    fullPage: false,
  });
  await page.waitForTimeout(700);
  await page.screenshot({
    path: `${evidenceDirectory}/${viewport.name}-complete.png`,
    fullPage: false,
  });
} else if (requestedState === "question") {
  await page.getByRole("button", { name: "Ask team" }).click();
  await page.getByRole("combobox").selectOption("risk");
  await page
    .getByRole("textbox", { name: "Question", exact: true })
    .fill("What could break the base case?");
  await page.getByRole("button", { name: "Send question" }).click();
  await page.screenshot({
    path: `${evidenceDirectory}/${viewport.name}-question.png`,
    fullPage: false,
  });
} else {
  await page.waitForTimeout(700);
  await page.screenshot({
    path: `${evidenceDirectory}/${viewport.name}-complete.png`,
    fullPage: false,
  });
}

const metrics = await page.evaluate(() => ({
  clientWidth: document.documentElement.clientWidth,
  scrollWidth: document.documentElement.scrollWidth,
  complete: document.querySelector("[data-complete='true']") !== null,
  sidebarVisible: (() => {
    const element = document.querySelector(".research-sidebar");
    if (!element) return false;
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  })(),
  provenance: window.__STOCKSEMBLY_RESEARCH_TEST__
    ? {
        mode: window.__STOCKSEMBLY_RESEARCH_TEST__.mode,
        eventModes: [
          ...new Set(
            window.__STOCKSEMBLY_RESEARCH_TEST__.events.map(
              (event) => event.mode,
            ),
          ),
        ],
        artifactModes: [
          ...new Set(
            window.__STOCKSEMBLY_RESEARCH_TEST__.artifacts.map(
              (artifact) => artifact.mode,
            ),
          ),
        ],
        eventCount: window.__STOCKSEMBLY_RESEARCH_TEST__.events.length,
        artifactCount: window.__STOCKSEMBLY_RESEARCH_TEST__.artifacts.length,
        codex: window.__STOCKSEMBLY_RESEARCH_TEST__.codex,
      }
    : null,
}));
if (requestedMode === "fixture") {
  const provenance = metrics.provenance;
  const eventModes = provenance?.eventModes ?? [];
  const artifactModes = provenance?.artifactModes ?? [];
  if (
    provenance?.mode !== "fixture" ||
    eventModes.some((mode) => mode !== "fixture") ||
    artifactModes.some((mode) => mode !== "fixture")
  ) {
    throw new Error("FIXTURE_PROVENANCE_INVALID");
  }
}
await page.close();

await browser.close();
await writeFile(
  `${evidenceDirectory}/${viewport.name}-${requestedState}.json`,
  `${JSON.stringify(
    {
      viewport,
      state: requestedState,
      locale: requestedLocale,
      mode: requestedMode,
      browserErrors,
      initialPaint,
      completePaint,
      metrics,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
