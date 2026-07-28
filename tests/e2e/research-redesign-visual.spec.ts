import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const evidenceDir = path.resolve(
  process.env["RESEARCH_REDESIGN_EVIDENCE_DIR"] ??
    ".omo/evidence/research-redesign/final",
);

async function prepareEvidence(): Promise<void> {
  await mkdir(evidenceDir, { recursive: true });
}

test("captures the production-shaped three-pane research workspace", async ({
  browser,
}) => {
  await prepareEvidence();
  const desktop = await browser.newPage({
    viewport: { width: 1440, height: 1024 },
  });
  await desktop.goto("/research/NVDA?lang=en");
  await expect(desktop.getByText("LIVE RESEARCH ROOM")).toBeVisible();
  await expect(
    desktop.getByRole("complementary", { name: "Research navigation" }),
  ).toBeVisible();
  await expect(
    desktop.getByRole("complementary", { name: "Meeting minutes" }),
  ).toBeVisible();
  await expect(desktop.locator(".research-command")).toHaveCount(0);
  await expect(desktop.locator(".evidence-summary")).toHaveCount(0);
  await expect(desktop.locator(".activity-tabs")).toHaveCount(0);
  await expect(desktop.locator(".meeting-minutes a")).toHaveCount(0);
  await desktop.locator("canvas").waitFor({ state: "visible" });
  await desktop.waitForTimeout(500);
  await desktop.screenshot({
    path: path.join(evidenceDir, "room-desktop-en.png"),
  });

  await desktop.getByRole("button", { name: "New conversation" }).click();
  await desktop
    .getByRole("textbox", { name: "Question" })
    .fill("What changes the base case?");
  await desktop.getByRole("button", { name: "Send" }).click();
  await expect(desktop.getByText("What changes the base case?")).toBeVisible();
  expect(
    await desktop.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await desktop.close();

  const tablet = await browser.newPage({
    viewport: { width: 768, height: 1024 },
  });
  await tablet.goto("/research/NVDA?lang=en");
  await tablet.locator("canvas").waitFor({ state: "visible" });
  await expect(
    tablet.getByRole("complementary", { name: "Research navigation" }),
  ).toBeVisible();
  await expect(tablet.getByText("$181.46")).toBeVisible();
  await expect(
    tablet.getByRole("complementary", { name: "Meeting minutes" }),
  ).toBeVisible();
  expect(
    await tablet.locator(".research-sidebar").evaluate((element) => ({
      display: getComputedStyle(element).display,
      width: element.getBoundingClientRect().width,
    })),
  ).toEqual({ display: "block", width: 248 });
  await tablet.waitForTimeout(500);
  await tablet.screenshot({
    path: path.join(evidenceDir, "room-tablet-en.png"),
    fullPage: true,
  });
  expect(
    await tablet.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await tablet.close();

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await mobile.goto("/research/NVDA?lang=ko");
  await mobile.locator("canvas").waitFor({ state: "visible" });
  await expect(
    mobile.getByRole("complementary", { name: "리서치 내비게이션" }),
  ).toBeVisible();
  await expect(
    mobile.getByRole("complementary", { name: "회의록" }),
  ).toBeVisible();
  await mobile.waitForTimeout(500);
  await mobile.screenshot({
    path: path.join(evidenceDir, "room-mobile-ko.png"),
    fullPage: true,
  });
  expect(
    await mobile.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await mobile.close();
});
