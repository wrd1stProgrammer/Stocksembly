import { expect, test } from "@playwright/test";

test("renders the v8 snapshot calibration surface and camera contract", async ({
  page,
}, testInfo) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      browserErrors.push(message.text());
    }
  });

  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto("/showcase/office-calibration");
  await expect(
    page.getByRole("heading", { name: "Immutable renderer inspection" }),
  ).toBeVisible();
  const calibration = page.locator('[data-calibration-ready="true"]');
  await expect(calibration).toBeVisible();
  const canvas = page.locator("canvas.office-game__canvas");
  await expect(canvas).toHaveCount(1);
  const geometry = await page.evaluate(() => {
    const scene = document.querySelector<HTMLElement>(
      ".office-calibration__scene",
    );
    const canvasElement = document.querySelector<HTMLCanvasElement>(
      ".office-calibration__scene canvas.office-game__canvas",
    );
    if (!scene || !canvasElement) throw new Error("calibration nodes missing");
    const sceneBox = scene.getBoundingClientRect();
    const canvasBox = canvasElement.getBoundingClientRect();
    return {
      sceneRatio: sceneBox.width / sceneBox.height,
      canvasRatio: canvasBox.width / canvasBox.height,
      actorCount: scene.getAttribute("data-render-actor-count"),
      cameraMode: scene.getAttribute("data-camera-mode"),
      uiLayout: scene.getAttribute("data-office-ui-layout"),
    };
  });
  expect(geometry.sceneRatio).toBeCloseTo(1374 / 1145, 2);
  expect(geometry.canvasRatio).toBeCloseTo(1374 / 1145, 2);
  expect(geometry.actorCount).toBe("11");
  expect(geometry.cameraMode).toMatch(/focus|overview/);
  expect(geometry.uiLayout).toBeTruthy();

  await page.getByRole("button", { name: "Overview" }).click();
  await expect(calibration).toHaveAttribute("data-camera-mode", "overview");
  await page.getByRole("button", { name: "+40 ticks" }).click();
  await expect(calibration).toHaveAttribute("data-render-tick", "40");
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(calibration).toHaveAttribute("data-render-beat", "complete");
  await page.getByRole("button", { name: "Focus" }).click();
  await expect(calibration).toHaveAttribute("data-camera-mode", "focus");
  await page.screenshot({
    path: testInfo.outputPath("office-v8-calibration.png"),
    fullPage: true,
  });
  expect(browserErrors).toEqual([]);
});

test("keeps reduced-motion research completion semantic and visual", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/research/NVDA?lang=ko");
  await expect(page.locator(".office-game")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  );
  await page.getByRole("button", { name: "완료로 이동" }).click();
  await expect(page.getByTestId("public-ledger")).toHaveAttribute(
    "data-complete",
    "true",
  );
  await expect(
    page.locator('[data-testid="office-semantic-summary"]'),
  ).toContainText("포럼");
  await expect(page.locator(".activity-panel__live")).toContainText(
    "실시간 공개 원장",
  );
  await expect(page.locator("canvas.office-game__canvas")).toBeVisible();
});

test("uses a fixed mobile overview camera with the native v8 stage", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/research/NVDA?lang=ko");
  const stage = page.locator(".office-stage");
  await expect(stage).toHaveAttribute("data-camera-mode", "overview");
  await expect(page.locator(".office-camera-toggle")).toHaveCount(0);
  const stageRatio = await stage.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.width / box.height;
  });
  expect(stageRatio).toBeCloseTo(1374 / 1145, 2);
  await expect(page.locator(".office-stage__objective")).toBeHidden();
  await expect(
    page.locator('[data-testid="office-semantic-summary"]'),
  ).toHaveCount(1);
});

test("keeps the desktop research room at 70/30 with matching v8 canvas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto("/research/NVDA?lang=en");
  await expect(
    page.locator(".office-stage canvas.office-game__canvas"),
  ).toBeVisible();
  const metrics = await page.evaluate(() => {
    const office = document.querySelector<HTMLElement>(".office-workbench");
    const activity = document.querySelector<HTMLElement>(".activity-panel");
    const stage = document.querySelector<HTMLElement>(".office-stage");
    const canvas = document.querySelector<HTMLCanvasElement>(
      ".office-stage canvas.office-game__canvas",
    );
    if (!office || !activity || !stage || !canvas) {
      throw new Error("desktop research nodes missing");
    }
    const officeWidth = office.getBoundingClientRect().width;
    const activityWidth = activity.getBoundingClientRect().width;
    const stageBox = stage.getBoundingClientRect();
    const canvasBox = canvas.getBoundingClientRect();
    return {
      officeRatio: officeWidth / (officeWidth + activityWidth),
      activityRatio: activityWidth / (officeWidth + activityWidth),
      stageRatio: stageBox.width / stageBox.height,
      canvasRatio: canvasBox.width / canvasBox.height,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
  expect(metrics.officeRatio).toBeGreaterThanOrEqual(0.69);
  expect(metrics.officeRatio).toBeLessThanOrEqual(0.71);
  expect(metrics.activityRatio).toBeGreaterThanOrEqual(0.29);
  expect(metrics.activityRatio).toBeLessThanOrEqual(0.31);
  expect(metrics.stageRatio).toBeCloseTo(1374 / 1145, 2);
  expect(metrics.canvasRatio).toBeCloseTo(1374 / 1145, 2);
  expect(metrics.scrollWidth).toBe(metrics.clientWidth);
});

test("cleans up and reports a failed v8 office asset load", async ({
  page,
}) => {
  await page.route("**/research/office-v8/base.png", (route) => route.abort());
  await page.goto("/showcase/office-calibration");
  await expect(page.locator('[data-calibration-error="true"]')).toBeVisible();
  await expect(page.locator("canvas.office-game__canvas")).toHaveCount(0);
});
