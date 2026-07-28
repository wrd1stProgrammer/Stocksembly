import { expect, type Page, test } from "@playwright/test";
import { PNG } from "pngjs";

async function assertPaintedCanvas(page: Page): Promise<void> {
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
  const colors = new Set<number>();
  let nonBlackPixels = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const red = image.data[offset] ?? 0;
    const green = image.data[offset + 1] ?? 0;
    const blue = image.data[offset + 2] ?? 0;
    colors.add((red << 16) | (green << 8) | blue);
    if (red + green + blue > 36) nonBlackPixels += 1;
  }
  expect(nonBlackPixels).toBeGreaterThan(image.width * image.height * 0.02);
  expect(colors.size).toBeGreaterThan(16);
}

test("fixture composition stays deterministic and provenance-pure", async ({
  page,
}) => {
  const externalRequests: string[] = [];
  await page.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    if (
      requestUrl.startsWith("http://127.0.0.1:4174") ||
      requestUrl.startsWith("blob:") ||
      requestUrl.startsWith("data:")
    ) {
      await route.continue();
      return;
    }
    externalRequests.push(requestUrl);
    await route.abort("blockedbyclient");
  });
  page.on("request", (request) => {
    if (
      !request.url().startsWith("http://127.0.0.1:4174") &&
      !request.url().startsWith("blob:") &&
      !request.url().startsWith("data:")
    ) {
      externalRequests.push(request.url());
    }
  });

  await page.goto("/research/NVDA?lang=en");
  await expect(page.locator(".research-shell")).toHaveAttribute(
    "data-research-mode",
    "fixture",
  );
  await expect(page.locator(".office-stage canvas")).toBeVisible();
  await assertPaintedCanvas(page);

  const provenance = await page.evaluate(() => {
    const bridge = window.__STOCKSEMBLY_RESEARCH_TEST__;
    if (!bridge) throw new Error("FIXTURE_BRIDGE_MISSING");
    return {
      mode: bridge.mode,
      eventModes: [...new Set(bridge.events.map((event) => event.mode))],
      artifactModes: [
        ...new Set(bridge.artifacts.map((artifact) => artifact.mode)),
      ],
      eventCount: bridge.events.length,
      artifactCount: bridge.artifacts.length,
      codex: bridge.codex,
    };
  });

  expect(provenance).toEqual({
    mode: "fixture",
    eventModes: ["fixture"],
    artifactModes: ["fixture"],
    eventCount: expect.any(Number),
    artifactCount: expect.any(Number),
    codex: expect.objectContaining({
      kind: "fake",
      invocationCount: expect.any(Number),
    }),
  });
  expect(provenance.eventCount).toBeGreaterThan(0);
  expect(provenance.artifactCount).toBeGreaterThan(0);
  expect(provenance.codex).toEqual(
    expect.objectContaining({
      kind: "fake",
      invocationCount: expect.any(Number),
    }),
  );
  expect(provenance.codex.invocationCount).toBeGreaterThan(0);
  expect(
    await page.locator(".research-sidebar").evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    }),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  expect(externalRequests).toEqual([]);
});
