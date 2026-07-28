import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const evidenceDirectory = ".omo/evidence/stocksembly-home";
const baseUrl = process.env.CAPTURE_URL ?? "http://127.0.0.1:4175";
await mkdir(evidenceDirectory, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const report = [];

async function capture(name, options) {
  const page = await browser.newPage({
    viewport: options.viewport,
    deviceScaleFactor: options.deviceScaleFactor ?? 1,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto(`${baseUrl}${options.path ?? "/"}`);
  await page.evaluate(() => document.fonts.ready);
  if (options.action) await options.action(page);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelector(".app-shell")?.scrollTo(0, 0);
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) => animation.effect?.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => void document.body.offsetHeight);
  await page.screenshot({ fullPage: options.fullPage ?? false });
  await page.waitForTimeout(100);
  await page.screenshot({
    path: `${evidenceDirectory}/${name}.png`,
    fullPage: options.fullPage ?? false,
  });
  const metrics = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  report.push({ name, viewport: options.viewport, consoleErrors, metrics });
  await page.close();
}

await capture("home-reference-size", {
  viewport: { width: 1486, height: 769 },
  deviceScaleFactor: 2,
});
await capture("home-desktop-focus", {
  viewport: { width: 1280, height: 900 },
  action: async (page) => page.getByRole("searchbox").focus(),
});
await capture("home-tablet", { viewport: { width: 768, height: 1024 } });
await capture("home-mobile", { viewport: { width: 375, height: 812 } });
await capture("home-mobile-ko", {
  viewport: { width: 375, height: 812 },
  action: async (page) => page.getByRole("button", { name: "한국어" }).click(),
});
await capture("home-tablet-ko", {
  viewport: { width: 768, height: 1024 },
  action: async (page) => page.getByRole("button", { name: "한국어" }).click(),
});
await capture("home-mobile-ko-result", {
  viewport: { width: 375, height: 812 },
  action: async (page) => {
    await page.getByRole("button", { name: "한국어" }).click();
    await page.getByRole("searchbox").fill("NVDA");
  },
});
await capture("home-mobile-ko-no-result", {
  viewport: { width: 375, height: 812 },
  action: async (page) => {
    await page.getByRole("button", { name: "한국어" }).click();
    await page.getByRole("searchbox").fill("ZZZZ");
  },
});
await capture("home-mobile-ko-submitted", {
  viewport: { width: 375, height: 812 },
  action: async (page) => {
    await page.getByRole("button", { name: "한국어" }).click();
    await page.getByRole("searchbox").fill("NVDA");
    await page.getByRole("button", { name: /NVDA NVIDIA Corporation/ }).click();
    await page.getByRole("button", { name: "리서치 시작" }).click();
    await page.getByText("NVDA 리서치 룸이 준비됐습니다.").waitFor();
  },
});
await capture("home-no-result", {
  viewport: { width: 1280, height: 900 },
  action: async (page) => page.getByRole("searchbox").fill("ZZZZ"),
});
await capture("home-result", {
  viewport: { width: 1280, height: 900 },
  action: async (page) => page.getByRole("searchbox").fill("NVDA"),
});
await capture("home-submitted", {
  viewport: { width: 1280, height: 900 },
  action: async (page) => {
    await page.getByRole("searchbox").fill("NVDA");
    await page.getByRole("button", { name: /NVDA NVIDIA Corporation/ }).click();
    await page.getByRole("button", { name: "Start research" }).click();
    await page.getByText("NVDA research room is ready.").waitFor();
  },
});
await capture("showcase-desktop", {
  viewport: { width: 1280, height: 900 },
  path: "/showcase",
  fullPage: true,
});
await capture("showcase-tablet", {
  viewport: { width: 768, height: 1024 },
  path: "/showcase",
  fullPage: true,
});
await capture("showcase-mobile", {
  viewport: { width: 375, height: 812 },
  path: "/showcase",
  fullPage: true,
});

await writeFile(
  `${evidenceDirectory}/capture-report.json`,
  JSON.stringify(report, null, 2),
);
await browser.close();
