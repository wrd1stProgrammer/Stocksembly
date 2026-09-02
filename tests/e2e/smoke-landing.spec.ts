import { expect, test } from "@playwright/test";

test("remembers the chosen locale across navigation", async ({
  page,
  context,
}) => {
  await page.goto("/?lang=en");
  await page.getByRole("button", { name: "Language" }).click();
  await page.getByRole("option", { name: /^한국어/u }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");

  const cookie = (await context.cookies()).find(
    (entry) => entry.name === "stocksembly_locale",
  );
  expect(cookie?.value).toBe("ko");

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "AI 분석가 11명이 한 종목을 토론합니다.",
  );
});

test("serves the public information pages", async ({ page }) => {
  for (const path of ["/ko/glossary", "/about", "/terms"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  }
});
