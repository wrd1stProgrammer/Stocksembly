import { expect, type Page, test } from "@playwright/test";

// Typing before hydration finishes can be reset by React's first render, so
// retry the fill until the results list actually opens.
async function searchTicker(page: Page, query: string) {
  const searchbox = page.getByRole("searchbox", { name: "Ticker or company" });
  const results = page.getByRole("listbox", { name: "Search results" });
  await expect(async () => {
    await searchbox.fill(query);
    await expect(results).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20000 });
  return results;
}

test.describe("landing smoke", () => {
  test("presents the research-file narrative in English", async ({ page }) => {
    await page.goto("/?lang=en");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Eleven AI analysts debate one stock.",
    );
    await expect(
      page.getByRole("heading", {
        name: "Watch eleven analysts and the chair work — and disagree — in real time",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "A research file, not a tip." }),
    ).toBeVisible();
    for (const title of [
      "Sources attached",
      "Disagreement stays visible",
      "Easy mode for beginners",
    ])
      await expect(
        page.getByRole("heading", { name: title, level: 3 }),
      ).toBeVisible();
    await expect(page.locator(".prism-reveal-text")).toHaveText(
      "debate one stock.",
    );
    await expect(page.locator("footer.site-footer")).toContainText(
      "No buy or sell recommendations",
    );
  });

  test("switches the complete home interface to Korean", async ({ page }) => {
    await page.goto("/?lang=en");

    await page.getByRole("button", { name: "Language" }).click();
    await page.getByRole("option", { name: /^한국어/u }).click();

    await expect(page.locator("html")).toHaveAttribute("lang", "ko");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "AI 분석가 11명이 한 종목을 토론합니다.",
    );
    await expect(
      page.getByRole("heading", { name: "추천이 아니라 리서치 파일입니다." }),
    ).toBeVisible();
    await expect(page.locator(".prism-reveal-text")).toHaveText(
      "한 종목을 토론합니다.",
    );
    await expect(page.locator("footer.site-footer")).toContainText("매매 추천");
  });

  test("selects one stock and enables research once a question is entered", async ({
    page,
  }) => {
    await page.goto("/?lang=en");

    const results = await searchTicker(page, "NVDA");
    await results
      .getByRole("option", { name: /NVDA NVIDIA Corporation/u })
      .click();

    await expect(results).toBeHidden();
    const selection = page.locator(".search-console__selection");
    await expect(selection).toContainText("Selected · one stock at a time");
    await expect(selection).toContainText("NVDA");
    const start = page.getByRole("button", { name: "Build research" });
    await expect(start).toBeDisabled();

    await page
      .getByRole("textbox", { name: "Investment question" })
      .fill("Can growth justify today's valuation?");
    await expect(start).toBeEnabled();
  });

  test("keeps the mobile research action clear while results are open", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/?lang=en");

    const results = await searchTicker(page, "NVDA");
    const researchAction = page.getByRole("button", { name: "Build research" });
    const [resultsBox, actionBox] = await Promise.all([
      results.boundingBox(),
      researchAction.boundingBox(),
    ]);
    expect(resultsBox).not.toBeNull();
    expect(actionBox).not.toBeNull();
    expect(resultsBox?.y).toBeGreaterThanOrEqual(
      (actionBox?.y ?? 0) + (actionBox?.height ?? 0),
    );

    await results
      .getByRole("option", { name: /NVDA NVIDIA Corporation/u })
      .click();

    await expect(results).toBeHidden();
    await expect(researchAction).toBeVisible();
  });

  test("header destinations resolve to real page regions", async ({ page }) => {
    await page.goto("/?lang=en");

    await expect(page.locator("#product")).toHaveCount(1);
    await expect(page.locator("#research")).toHaveCount(1);
  });

  test("shows a recoverable empty result", async ({ page }) => {
    await page.goto("/?lang=en");

    const searchbox = page.getByRole("searchbox", {
      name: "Ticker or company",
    });
    await expect(searchbox).toBeVisible();
    await searchbox.fill("ZZZZ");
    await expect(searchbox).toHaveValue("ZZZZ");

    await expect(
      page.getByRole("listbox", { name: "Search results" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Build research" }),
    ).toBeDisabled();
  });
});

test.describe("research room smoke (fixture)", () => {
  test("opens the production-shaped research workspace", async ({ page }) => {
    await page.goto("/research/NVDA?lang=en");

    await expect(
      page.getByText("Research mandate issued").first(),
    ).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Research navigation" }),
    ).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: /Meeting minutes|회의록/u }),
    ).toBeVisible();
    await expect(page.locator(".research-command")).toHaveCount(0);
    await expect(page.locator(".evidence-summary")).toHaveCount(0);
  });

  test("keeps the research room usable on a mobile viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/research/NVDA?lang=ko");

    await expect(page.getByText("실시간 리서치 룸").first()).toBeVisible();
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
});
