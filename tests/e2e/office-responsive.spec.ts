import { expect, type Page, test } from "@playwright/test";

const researchPath = "/research/NVDA";

type UiBounds = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

type OfficeUiEntry = {
  readonly label: { readonly visible: boolean; readonly bounds: UiBounds };
  readonly bubble: { readonly visible: boolean; readonly bounds: UiBounds };
};

function overlaps(first: UiBounds, second: UiBounds): boolean {
  return !(
    first.right <= second.left ||
    first.left >= second.right ||
    first.bottom <= second.top ||
    first.top >= second.bottom
  );
}

async function openResearch(
  page: Page,
  width: number,
  height: number,
  locale: "en" | "ko" = "en",
) {
  await page.setViewportSize({ width, height });
  await page.goto(`${researchPath}?lang=${locale}`);
  await expect(page.locator(".research-shell")).toBeVisible();
  await expect(
    page.locator(".office-stage canvas.office-game__canvas"),
  ).toBeVisible();
}

async function assertBriefingCallout(
  page: Page,
  width: number,
  height: number,
): Promise<void> {
  await openResearch(page, width, height);
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.locator(".office-game")).toHaveAttribute(
    "data-render-beat",
    "briefing",
  );
  const callouts = await page.evaluate(() => {
    const objective = document.querySelector<HTMLElement>(
      ".office-stage__objective",
    );
    const game = document.querySelector<HTMLElement>(".office-game");
    if (!game) throw new Error("briefing game node missing");
    const layout = JSON.parse(
      game.getAttribute("data-office-ui-layout") ?? "[]",
    ) as Array<{
      bubble?: { visible?: boolean; bounds?: UiBounds };
    }>;
    const bubbles = layout.flatMap((entry) =>
      entry.bubble?.visible && entry.bubble.bounds ? [entry.bubble.bounds] : [],
    );
    return {
      domObjectiveCount: document.querySelectorAll(".office-stage__objective")
        .length,
      domObjectiveVisible: objective
        ? (() => {
            const objectiveStyle = getComputedStyle(objective);
            return (
              objectiveStyle.display !== "none" &&
              objectiveStyle.visibility !== "hidden" &&
              objectiveStyle.opacity !== "0"
            );
          })()
        : false,
      pixiBubbleCount: bubbles.length,
      pixiBubblesNonIntersecting: bubbles.every((entry, index) =>
        bubbles.slice(index + 1).every((other) => !overlaps(entry, other)),
      ),
    };
  });
  expect(callouts.domObjectiveCount).toBe(0);
  expect(callouts.domObjectiveVisible).toBe(false);
  expect(callouts.pixiBubbleCount).toBe(1);
  expect(callouts.pixiBubblesNonIntersecting).toBe(true);
}

test.describe("Todo 7 responsive research room contract", () => {
  test("keeps desktop office/activity tracks at 70/30 and the stage at 16:9", async ({
    page,
  }, testInfo) => {
    const results: Array<Record<string, number | string>> = [];
    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 1440, height: 1024 },
    ]) {
      await openResearch(page, viewport.width, viewport.height);
      const measurement = await page.evaluate(() => {
        const layout = document.querySelector<HTMLElement>(".research-layout");
        const rail = document.querySelector<HTMLElement>(".department-rail");
        const office = document.querySelector<HTMLElement>(".office-workbench");
        const activity = document.querySelector<HTMLElement>(".activity-panel");
        const stage = document.querySelector<HTMLElement>(".office-stage");
        const canvas = document.querySelector<HTMLCanvasElement>(
          ".office-stage canvas.office-game__canvas",
        );
        if (!layout || !rail || !office || !activity || !stage || !canvas) {
          throw new Error("responsive measurement nodes are missing");
        }
        const railWidth = rail.getBoundingClientRect().width;
        const officeWidth = office.getBoundingClientRect().width;
        const activityWidth = activity.getBoundingClientRect().width;
        const stageBox = stage.getBoundingClientRect();
        const canvasBox = canvas.getBoundingClientRect();
        return {
          layoutWidth: layout.getBoundingClientRect().width,
          railWidth,
          officeWidth,
          activityWidth,
          officeRatio: officeWidth / (officeWidth + activityWidth),
          activityRatio: activityWidth / (officeWidth + activityWidth),
          stageRatio: stageBox.width / stageBox.height,
          canvasRatio: canvasBox.width / canvasBox.height,
          stageWidth: stageBox.width,
          stageHeight: stageBox.height,
          stageContentWidth: stage.clientWidth,
          stageContentHeight: stage.clientHeight,
          canvasWidth: canvasBox.width,
          canvasHeight: canvasBox.height,
        };
      });
      results.push({
        viewport: `${viewport.width}x${viewport.height}`,
        ...measurement,
      });
      expect(measurement.officeRatio).toBeGreaterThanOrEqual(0.69);
      expect(measurement.officeRatio).toBeLessThanOrEqual(0.71);
      expect(measurement.activityRatio).toBeGreaterThanOrEqual(0.29);
      expect(measurement.activityRatio).toBeLessThanOrEqual(0.31);
      expect(measurement.stageRatio).toBeCloseTo(16 / 9, 2);
      expect(measurement.canvasRatio).toBeCloseTo(16 / 9, 2);
      expect(
        Math.abs(measurement.stageContentWidth - measurement.canvasWidth),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(measurement.stageContentHeight - measurement.canvasHeight),
      ).toBeLessThanOrEqual(1);
    }
    await assertBriefingCallout(page, 1440, 1024);
    await assertBriefingCallout(page, 768, 1024);
    await testInfo.attach("desktop-measurements.json", {
      body: JSON.stringify(results, null, 2),
      contentType: "application/json",
    });
  });

  test("stacks tablet layout without page horizontal scroll", async ({
    page,
  }) => {
    await openResearch(page, 768, 1024);
    const metrics = await page.evaluate(() => {
      const layout = document.querySelector(".research-layout");
      if (!(layout instanceof Element)) {
        throw new Error("research layout is missing");
      }
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        layoutColumns: getComputedStyle(layout).gridTemplateColumns,
        railTop:
          document.querySelector(".department-rail")?.getBoundingClientRect()
            .top ?? -1,
        officeTop:
          document.querySelector(".office-workbench")?.getBoundingClientRect()
            .top ?? -1,
      };
    });
    expect(metrics.scrollWidth).toBe(metrics.clientWidth);
    expect(metrics.layoutColumns.split(" ")).toHaveLength(1);
    expect(metrics.officeTop).toBeGreaterThanOrEqual(metrics.railTop);
  });

  test("keeps the sidebar quote visible below the company name on tablets", async ({
    page,
  }) => {
    for (const [width, height] of [
      [820, 1180],
      [1180, 820],
    ] as const) {
      await openResearch(page, width, height, "ko");
      const sidebar = page.locator(".research-sidebar");
      const name = page.locator(".company-brief > div").first();
      const quote = page.locator(".company-brief__quote");
      await expect(sidebar).toBeVisible();
      await expect(quote).toBeVisible();
      await expect(quote.locator("strong")).toHaveText(/\$/u);
      const [sidebarBox, nameBox, quoteBox] = await Promise.all([
        sidebar.boundingBox(),
        name.boundingBox(),
        quote.boundingBox(),
      ]);
      if (!sidebarBox || !nameBox || !quoteBox) {
        throw new Error(`Sidebar quote is not laid out at ${width}x${height}`);
      }
      // The 220px tablet sidebar stacks the quote under the name instead of
      // squeezing the name into an ellipsis or hiding the quote.
      expect(quoteBox.y).toBeGreaterThanOrEqual(nameBox.y + nameBox.height - 1);
      expect(quoteBox.x + quoteBox.width).toBeLessThanOrEqual(
        sidebarBox.x + sidebarBox.width + 1,
      );
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
    }
  });

  test("stacks the minutes under the report on portrait tablets and keeps a proportional column on landscape", async ({
    page,
  }) => {
    // Portrait: the report keeps the full main column and the minutes sit below it.
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto(`${researchPath}?lang=ko&view=report`);
    await expect(page.locator(".research-shell")).toHaveAttribute(
      "data-transcript-open",
      "true",
    );
    const portrait = await page.evaluate(() => {
      const office = document
        .querySelector(".office-workbench")
        ?.getBoundingClientRect();
      const minutes = document
        .querySelector(".meeting-minutes")
        ?.getBoundingClientRect();
      const sidebar = document
        .querySelector(".research-sidebar")
        ?.getBoundingClientRect();
      return office && minutes && sidebar
        ? {
            officeWidth: office.width,
            officeBottom: office.bottom,
            minutesTop: minutes.top,
            minutesWidth: minutes.width,
            sidebarWidth: sidebar.width,
            viewportWidth: window.innerWidth,
          }
        : null;
    });
    if (!portrait) throw new Error("Portrait tablet layout did not render");
    expect(portrait.sidebarWidth).toBeGreaterThan(150);
    expect(portrait.officeWidth).toBeGreaterThanOrEqual(
      (portrait.viewportWidth - portrait.sidebarWidth) * 0.9,
    );
    expect(portrait.minutesWidth).toBeCloseTo(portrait.officeWidth, 0);
    expect(portrait.minutesTop).toBeGreaterThanOrEqual(portrait.officeBottom);

    // Landscape: three columns, minutes no wider than 30% of the viewport.
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.waitForTimeout(300);
    const landscape = await page.evaluate(() => {
      const office = document
        .querySelector(".office-workbench")
        ?.getBoundingClientRect();
      const minutes = document
        .querySelector(".meeting-minutes")
        ?.getBoundingClientRect();
      return office && minutes
        ? {
            officeWidth: office.width,
            minutesWidth: minutes.width,
            minutesLeft: minutes.left,
            officeRight: office.right,
            viewportWidth: window.innerWidth,
          }
        : null;
    });
    if (!landscape) throw new Error("Landscape tablet layout did not render");
    expect(landscape.minutesLeft).toBeGreaterThanOrEqual(landscape.officeRight);
    expect(landscape.minutesWidth).toBeLessThanOrEqual(
      landscape.viewportWidth * 0.3,
    );
    expect(landscape.officeWidth).toBeGreaterThan(landscape.minutesWidth);
  });

  test("keeps mobile on a stable overview without camera controls", async ({
    page,
  }) => {
    await openResearch(page, 390, 844, "ko");
    const scene = page.locator(".office-stage");
    await expect(scene).toHaveAttribute("data-camera-mode", "overview");
    await expect(page.locator(".office-camera-toggle")).toHaveCount(0);
    const overviewUi = await page
      .locator(".office-game")
      .evaluate<OfficeUiEntry[]>((node) => {
        const raw = node.getAttribute("data-office-ui-layout");
        return raw ? (JSON.parse(raw) as OfficeUiEntry[]) : [];
      });
    const visibleLabels = overviewUi.filter((entry) => entry.label.visible);
    expect(
      visibleLabels.every((entry, index) =>
        visibleLabels
          .slice(index + 1)
          .every((other) => !overlaps(entry.label.bounds, other.label.bounds)),
      ),
    ).toBe(true);
    const visibleUi = overviewUi.filter(
      (entry) => entry.label.visible || entry.bubble.visible,
    );
    expect(
      visibleUi.every((entry, index) =>
        visibleUi.slice(index + 1).every((other) => {
          const firstRects = [
            ...(entry.label.visible ? [entry.label.bounds] : []),
            ...(entry.bubble.visible ? [entry.bubble.bounds] : []),
          ];
          const secondRects = [
            ...(other.label.visible ? [other.label.bounds] : []),
            ...(other.bubble.visible ? [other.bubble.bounds] : []),
          ];
          return firstRects.every((first) =>
            secondRects.every((second) => !overlaps(first, second)),
          );
        }),
      ),
    ).toBe(true);
    await expect(page.locator(".office-stage__objective")).toBeHidden();
  });

  test("keeps KO/EN semantic summaries and reduced-motion ledger state equivalent", async ({
    page,
  }) => {
    for (const locale of ["en", "ko"] as const) {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openResearch(page, 390, 844, locale);
      await expect(
        page.locator("[data-testid=office-semantic-summary]"),
      ).toHaveCount(1);
      await expect(page.locator("[aria-live=polite]").first()).toBeVisible();
      const visibleOverflow = await page.evaluate(
        () =>
          [
            ...document.querySelectorAll<HTMLElement>(
              ".research-shell h1, .office-heading, .office-stage__objective, .activity-feed article",
            ),
          ].filter((element) => element.scrollWidth > element.clientWidth + 1)
            .length,
      );
      expect(visibleOverflow).toBe(0);
      await page
        .getByRole("button", {
          name: locale === "ko" ? "완료로 이동" : "Skip to result",
        })
        .click();
      await expect(page.getByTestId("public-ledger")).toHaveAttribute(
        "data-complete",
        "true",
      );
      await expect(page.locator(".activity-panel__live")).toContainText(
        locale === "ko" ? "실시간 공개 원장" : "LIVE PUBLIC LEDGER",
      );
      await expect(
        page.locator("[data-testid=office-semantic-summary]"),
      ).toContainText(locale === "ko" ? "포럼" : "forum");

      const metrics = page.locator(".research-command__metrics > span");
      await expect(metrics).toHaveCount(3);
      expect(
        await metrics.evaluateAll((nodes) =>
          nodes.every((node) => {
            const element = node as HTMLElement;
            return (
              element.textContent?.trim().length !== 0 &&
              element.scrollWidth <= element.clientWidth
            );
          }),
        ),
      ).toBe(true);
      const participantNames = page.locator(".activity-participants__name");
      expect(
        await participantNames.evaluateAll((nodes) =>
          nodes.every((node) => {
            const element = node as HTMLElement;
            return (
              getComputedStyle(element).whiteSpace === "nowrap" &&
              element.getClientRects().length === 1
            );
          }),
        ),
      ).toBe(true);

      const roleNodes = page.locator(".agent-list li span");
      expect(
        await roleNodes.evaluateAll((nodes) =>
          nodes.every((node) => {
            const element = node as HTMLElement;
            const style = getComputedStyle(element);
            return (
              element.scrollWidth <= element.clientWidth + 1 &&
              style.whiteSpace !== "nowrap" &&
              style.overflow !== "hidden" &&
              style.textOverflow !== "ellipsis"
            );
          }),
        ),
      ).toBe(true);
    }
  });
});
