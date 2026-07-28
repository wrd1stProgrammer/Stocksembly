import { expect, test } from "@playwright/test";

test("searches a US company and starts research", async ({ page }) => {
  // Given
  await page.goto("/");

  // When
  await page.getByRole("searchbox", { name: "US company search" }).fill("NVDA");
  await page.getByRole("button", { name: /NVDA NVIDIA Corporation/ }).click();
  await page.getByRole("button", { name: "Start research" }).click();

  // Then
  await expect(page).toHaveURL(/\/research\/NVDA\?lang=en/);
  await expect(page.getByText("LIVE RESEARCH ROOM")).toBeVisible();
});

test("opens the production-shaped research workspace", async ({ page }) => {
  await page.goto("/research/NVDA?lang=en");

  await expect(page.getByText("Research mandate issued").first()).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Research navigation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Meeting minutes" }),
  ).toBeVisible();
  await expect(page.locator(".research-command")).toHaveCount(0);
  await expect(page.locator(".evidence-summary")).toHaveCount(0);
});

test("keeps the research room usable on a mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/research/NVDA?lang=ko");

  await expect(page.getByText("LIVE RESEARCH ROOM")).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "회의록" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("keeps the mobile research action clear while results are open", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  await page.getByRole("searchbox", { name: "US company search" }).fill("NVDA");
  const results = page.getByRole("region", { name: "Search results" });
  const researchAction = page.getByRole("button", { name: "Start research" });
  const [resultsBox, actionBox] = await Promise.all([
    results.boundingBox(),
    researchAction.boundingBox(),
  ]);

  expect(resultsBox).not.toBeNull();
  expect(actionBox).not.toBeNull();
  expect(resultsBox?.y).toBeGreaterThanOrEqual(
    (actionBox?.y ?? 0) + (actionBox?.height ?? 0),
  );

  await page.getByRole("button", { name: /NVDA NVIDIA Corporation/ }).click();

  await expect(
    page.getByRole("region", { name: "Search results" }),
  ).toBeHidden();
  await expect(researchAction).toBeEnabled();
});

test("header destinations resolve to real page regions", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#product")).toHaveCount(1);
  await expect(page.locator("#methodology")).toHaveCount(1);
  await expect(page.locator("#research")).toHaveCount(1);
  await expect(page.locator("#research-file")).toHaveCount(1);
});

test("presents the research method and a complete footer", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Watch the work, not a spinner." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "A confident answer is not the same as a tested one.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "The conclusion stays useful after today.",
    }),
  ).toBeVisible();
  await expect(page.locator("footer.site-footer")).toContainText(
    "not investment advice",
  );
});

test("switches the complete home interface to Korean", async ({ page }) => {
  // Given
  await page.goto("/");

  // When
  await page.getByRole("button", { name: "한국어" }).click();

  // Then
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(
    page.getByRole("heading", { name: "기업의 모든 면을 보세요." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "로딩 화면 대신, 실제 조사 과정을 보세요.",
    }),
  ).toBeVisible();
  await expect(page.locator("footer.site-footer")).toContainText("투자 조언");
});

test("reveals one semantic hero word through the prism treatment", async ({
  page,
}) => {
  await page.goto("/");

  const prismWord = page.locator(".prism-reveal-text");
  await expect(prismWord).toHaveCount(1);
  await expect(prismWord).toHaveText("company.");

  await page.getByRole("button", { name: "한국어" }).click();
  await expect(prismWord).toHaveText("보세요.");
});

test("shows a recoverable empty result", async ({ page }) => {
  // Given
  await page.goto("/");

  // When
  await page.getByRole("searchbox", { name: "US company search" }).fill("ZZZZ");

  // Then
  await expect(
    page.getByText("No supported US company found. Try another ticker."),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Start research" }),
  ).toBeDisabled();
});
