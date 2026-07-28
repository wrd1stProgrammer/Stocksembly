import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";

const base = "http://127.0.0.1:4325";
const out = path.resolve(".omo/evidence/office-v7/final-f3-manual-qa");
await mkdir(out, { recursive: true });

function observe(page) {
  const audit = { console: [], pageErrors: [], requestFailures: [], badResponses: [] };
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) audit.console.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => audit.pageErrors.push(e.message));
  page.on("requestfailed", (r) => audit.requestFailures.push(`${r.method()} ${r.url()}: ${r.failure()?.errorText ?? "unknown"}`));
  page.on("response", (r) => { if (r.status() >= 400) audit.badResponses.push(`${r.status()} ${r.url()}`); });
  return audit;
}

async function attrs(page) {
  return page.locator(".office-game").evaluate((e) => Object.fromEntries([...e.attributes].map((a) => [a.name, a.value])));
}

async function paint(page, name) {
  const image = PNG.sync.read(await page.locator(".office-game canvas").screenshot({ path: path.join(out, name) }));
  let nonBlack = 0; let sum = 0; let square = 0; const colors = new Set();
  for (let i = 0; i < image.data.length; i += 4) {
    const r = image.data[i] ?? 0, g = image.data[i + 1] ?? 0, b = image.data[i + 2] ?? 0;
    const l = (r + g + b) / 3; sum += l; square += l * l;
    colors.add((r << 16) | (g << 8) | b); if (l > 12) nonBlack += 1;
  }
  const total = image.width * image.height; const mean = sum / total;
  return { width: image.width, height: image.height, totalPixels: total, nonBlackPixels: nonBlack, distinctColors: colors.size, luminanceVariance: square / total - mean * mean };
}

async function openResearch(page, locale = "en") {
  await page.goto(`${base}/`);
  if (locale === "ko") await page.getByRole("button", { name: "한국어" }).click();
  await page.getByRole("searchbox", { name: "US company search" }).fill("NVDA");
  await page.getByRole("button", { name: /NVDA NVIDIA Corporation/ }).click();
  await page.getByRole("button", { name: locale === "ko" ? "분석 시작" : "Start research" }).click();
  await page.waitForURL(/\/research\/NVDA/);
  await page.locator(".office-game").waitFor({ state: "visible" });
  await page.waitForFunction(() => Number(document.querySelector(".office-game")?.getAttribute("data-render-frame-count") ?? 0) >= 2);
  return attrs(page);
}

const browser = await chromium.launch({ headless: true });
const desktop = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
const desktopAudit = observe(desktop);
const desktopResult = { flow: [], screenshots: {}, checks: {} };
await openResearch(desktop, "en");
desktopResult.flow.push({ action: "home-search-nvda", url: desktop.url() });
desktopResult.screenshots.initial = await paint(desktop, "desktop-initial.png");
desktopResult.checks.initialActors = await desktop.locator(".office-game").getAttribute("data-render-actor-count");
const beforePause = await desktop.locator(".office-game").getAttribute("data-snapshot-tick");
await desktop.getByRole("button", { name: "Pause" }).click();
await desktop.waitForTimeout(250);
const paused = await attrs(desktop);
await desktop.waitForTimeout(250);
const pausedAgain = await attrs(desktop);
desktopResult.flow.push({ action: "pause", beforePause, pausedTick: paused["data-snapshot-tick"], frozen: paused["data-snapshot-tick"] === pausedAgain["data-snapshot-tick"] });
await desktop.getByRole("button", { name: "Resume" }).click();
await desktop.waitForTimeout(300);
const resumed = await attrs(desktop);
desktopResult.flow.push({ action: "resume", tickAfterResume: resumed["data-snapshot-tick"], advanced: Number(resumed["data-snapshot-tick"]) > Number(paused["data-snapshot-tick"]) });
await desktop.getByRole("button", { name: "Skip to result" }).click();
await desktop.locator(".office-game").waitFor({ state: "visible" });
await desktop.getByText("Research file assembled").first().waitFor({ state: "visible" });
desktopResult.flow.push({ action: "skip", complete: await desktop.locator(".office-game").getAttribute("data-complete"), tick: await desktop.locator(".office-game").getAttribute("data-snapshot-tick") });
desktopResult.screenshots.complete = await paint(desktop, "desktop-complete.png");
const reportButton = desktop.getByRole("button", { name: "View research file" });
desktopResult.checks.reportButton = await reportButton.isVisible();
await reportButton.click();
desktopResult.flow.push({ action: "report", reportVisible: await desktop.getByRole("heading", { name: /Platform strength remains exceptional/ }).isVisible() });
await desktop.getByRole("button", { name: "Replay" }).click();
await desktop.waitForTimeout(200);
desktopResult.flow.push({ action: "replay", replayTick: await desktop.locator(".office-game").getAttribute("data-snapshot-tick") });
desktopResult.audit = desktopAudit;

const mobileResults = [];
for (const locale of ["en", "ko"]) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const audit = observe(page);
  await openResearch(page, locale);
  const initial = await attrs(page);
  await page.screenshot({ path: path.join(out, `mobile-${locale}-initial.png`), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const actorCount = initial["data-render-actor-count"];
  await page.getByRole("button", { name: locale === "ko" ? "일시정지" : "Pause" }).click();
  const paused = await attrs(page);
  const pausePaint = await paint(page, `mobile-${locale}-paused.png`);
  await page.waitForTimeout(180);
  const pausedAgain = await attrs(page);
  await page.getByRole("button", { name: locale === "ko" ? "완료로 이동" : "Skip to result" }).click();
  await page.getByText(locale === "ko" ? "리서치 파일을 완성했습니다" : "Research file assembled").first().waitFor({ state: "visible" });
  const complete = await attrs(page);
  mobileResults.push({ locale, reducedMotion: initial["data-reduced-motion"], cameraMode: initial["data-camera-mode"], actorCount, overflow, pausedFrozen: paused["data-snapshot-tick"] === pausedAgain["data-snapshot-tick"], pausePaint, complete: complete["data-complete"], tick: complete["data-snapshot-tick"], audit });
  await page.close();
}

await writeFile(path.join(out, "manual-flow.json"), `${JSON.stringify({ desktop: desktopResult, mobile: mobileResults }, null, 2)}\n`, "utf8");
await desktop.close();
await browser.close();
