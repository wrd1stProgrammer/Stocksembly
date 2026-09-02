import { expect, test } from "@playwright/test";

test("advances the fixture research office and ledger over time", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.goto("/research/NVDA?lang=ko");
  const game = page.locator(".office-game").first();
  await expect(game).toHaveAttribute("data-snapshot-tick", /\d+/u);
  const startTick = Number(await game.getAttribute("data-snapshot-tick"));

  await page.waitForTimeout(3000);

  const laterTick = Number(await game.getAttribute("data-snapshot-tick"));
  expect(laterTick).toBeGreaterThan(startTick);
  await expect(page.getByTestId("public-ledger")).toBeVisible();
  await expect(page.getByTestId("public-ledger")).not.toBeEmpty();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("opens the completed research file with its source register", async ({
  page,
}) => {
  for (const lang of ["ko", "en"] as const) {
    await page.goto(`/research/NVDA?lang=${lang}&view=report`);
    await expect(page.locator(".research-shell")).toHaveAttribute(
      "data-research-state",
      "published",
    );
    const sourcesToggle = page
      .locator("details summary")
      .filter({ hasText: /출처|source/iu })
      .first();
    if ((await sourcesToggle.count()) > 0) await sourcesToggle.click();
    await expect(page.locator(".research-source-register")).toBeVisible();
    await expect(page.locator(".research-source-table").first()).toBeVisible();
    await expect(
      page.locator(".completed-research-file__footer"),
    ).toBeVisible();
  }
});
