import { expect, test } from "@playwright/test";

for (const path of ["/login", "/signup"] as const) {
  test(`renders the ${path} form`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("form").first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.locator("footer.site-footer, .site-footer")).toHaveCount(
      0,
    );
  });
}
