import { expect, test } from "@playwright/test";

test("keeps the collapsed meeting-minutes reopen button inside an iPad landscape viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto("/research-room?lang=ko");

  const reportHref = await page
    .locator('a[href^="/research-room/"]')
    .first()
    .getAttribute("href");
  if (reportHref === null) throw new Error("public research report is missing");
  await page.goto(reportHref);
  await page.waitForTimeout(1_000);

  await page.getByTitle("우측 패널 접기").click();
  const reopen = page.getByTitle("우측 패널 펼치기");
  await expect(reopen).toBeVisible();

  const box = await reopen.boundingBox();
  expect(box, "the reopen button must have a rendered box").not.toBeNull();
  if (box === null) return;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(820);

  await reopen.click();
  await expect(page.locator(".meeting-minutes")).toHaveAttribute(
    "data-panel-open",
    "true",
  );
  const [reportBox, minutesBox] = await Promise.all([
    page.locator(".office-workbench").boundingBox(),
    page.locator(".meeting-minutes").boundingBox(),
  ]);
  expect(reportBox).not.toBeNull();
  expect(minutesBox).not.toBeNull();
  if (reportBox === null || minutesBox === null) return;
  expect(reportBox.width).toBeGreaterThan(minutesBox.width);
  expect(minutesBox.width).toBeLessThanOrEqual(360);
});
