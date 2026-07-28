// allow: SIZE_OK — one controlled-clock office-v7 acceptance narrative owns this spec.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { PNG } from "pngjs";
import { agents } from "../../src/research/mockResearch";
import { OFFICE_PUBLIC_EVENTS } from "../../src/research/officeChoreography";
import {
  OFFICE_NAVIGATION_GRID,
  officeCellKey,
} from "../../src/research/officeNavigation";
import { OFFICE_SCENE_MANIFEST } from "../../src/research/officeSceneManifest";
import type {
  OfficeActorSnapshot,
  OfficeSimulationSnapshot,
} from "../../src/research/officeSimulation";

const { OFFICE_V7_EVIDENCE_DIR: configuredEvidenceDir } = process.env;
const evidenceDir =
  configuredEvidenceDir ??
  path.join(process.cwd(), ".omo/evidence/office-v7/task-8-temporal");
const checkpointScreenshots = [
  { tick: 200, name: "work.png" },
  { tick: 340, name: "talk.png" },
  { tick: 560, name: "visit-a.png" },
  { tick: 920, name: "visit-b.png" },
  { tick: 1200, name: "gathering.png" },
  { tick: 1400, name: "forum.png" },
  { tick: 1580, name: "complete.png" },
] as const;

type BrowserAudit = {
  readonly console: string[];
  readonly pageErrors: string[];
  readonly requestFailures: string[];
  readonly badResponses: string[];
};

type CanvasPaintEvidence = {
  readonly width: number;
  readonly height: number;
  readonly totalPixels: number;
  readonly nonBlackPixels: number;
  readonly distinctColors: number;
  readonly luminanceVariance: number;
};

function observeBrowser(page: Page): BrowserAudit {
  const audit: BrowserAudit = {
    console: [],
    pageErrors: [],
    requestFailures: [],
    badResponses: [],
  };
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      audit.console.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => audit.pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    audit.requestFailures.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "unknown"}`,
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      audit.badResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  return audit;
}

async function writeJson(name: string, value: unknown): Promise<void> {
  await writeFile(
    path.join(evidenceDir, name),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

async function canvasPaintEvidence(
  office: Locator,
): Promise<CanvasPaintEvidence> {
  const image = PNG.sync.read(await office.locator("canvas").screenshot());
  const colors = new Set<number>();
  let nonBlackPixels = 0;
  let luminanceSum = 0;
  let luminanceSquareSum = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const red = image.data[offset] ?? 0;
    const green = image.data[offset + 1] ?? 0;
    const blue = image.data[offset + 2] ?? 0;
    const luminance = (red + green + blue) / 3;
    colors.add((red << 16) | (green << 8) | blue);
    if (luminance > 12) nonBlackPixels += 1;
    luminanceSum += luminance;
    luminanceSquareSum += luminance * luminance;
  }
  const totalPixels = image.width * image.height;
  const mean = luminanceSum / totalPixels;
  return {
    width: image.width,
    height: image.height,
    totalPixels,
    nonBlackPixels,
    distinctColors: colors.size,
    luminanceVariance: luminanceSquareSum / totalPixels - mean * mean,
  };
}

async function waitForPaintedOffice(
  page: Page,
  office: Locator,
): Promise<CanvasPaintEvidence> {
  await expect(office).toHaveAttribute("data-render-actor-count", "11");
  await page.waitForFunction(
    () =>
      Number(
        document
          .querySelector(".office-game")
          ?.getAttribute("data-render-frame-count") ?? 0,
      ) >= 2,
  );
  const visibleActorCount = Number(
    await office.getAttribute("data-render-visible-actor-count"),
  );
  const paint = await canvasPaintEvidence(office);
  expect(visibleActorCount).toBeGreaterThan(0);
  expect(paint.nonBlackPixels).toBeGreaterThan(paint.totalPixels * 0.02);
  expect(paint.distinctColors).toBeGreaterThan(16);
  expect(paint.luminanceVariance).toBeGreaterThan(1);
  return paint;
}

async function openCalibration(page: Page): Promise<void> {
  await page.goto("/showcase/office-calibration");
  await expect(page.locator("[data-calibration-ready=true]")).toBeVisible();
  await page.waitForFunction(
    () => window.__STOCKSEMBLY_OFFICE_TEST__ !== undefined,
  );
}

async function snapshot(page: Page): Promise<OfficeSimulationSnapshot> {
  return page.evaluate(() => {
    const bridge = window.__STOCKSEMBLY_OFFICE_TEST__;
    if (!bridge) throw new RangeError("Office calibration bridge is missing");
    return bridge.snapshot();
  });
}

async function advance(
  page: Page,
  ticks: number,
): Promise<readonly OfficeSimulationSnapshot[]> {
  return page.evaluate((count) => {
    const bridge = window.__STOCKSEMBLY_OFFICE_TEST__;
    if (!bridge) throw new RangeError("Office calibration bridge is missing");
    const frames = [];
    for (let index = 0; index < count; index += 1) {
      bridge.advanceTicks(1);
      frames.push(bridge.snapshot());
    }
    return frames;
  }, ticks);
}

function actor(
  frame: OfficeSimulationSnapshot,
  id: OfficeActorSnapshot["id"],
): OfficeActorSnapshot {
  const found = frame.actors.find((candidate) => candidate.id === id);
  if (!found) throw new RangeError(`Missing actor ${id} at tick ${frame.tick}`);
  return found;
}

function frameAt(
  frames: readonly OfficeSimulationSnapshot[],
  tick: number,
): OfficeSimulationSnapshot {
  const found = frames[tick];
  if (!found) throw new RangeError(`Missing trajectory frame ${tick}`);
  return found;
}

function manifestActor(id: OfficeActorSnapshot["id"]) {
  const found = OFFICE_SCENE_MANIFEST.roster.find(
    (candidate) => candidate.id === id,
  );
  if (!found) throw new RangeError(`Missing manifest actor ${id}`);
  return found;
}

function representativeCell(id: "company" | "financial" | "market" | "risk") {
  const department = OFFICE_SCENE_MANIFEST.departments[id];
  const anchor = department.talkAnchors.find(
    (candidate) => candidate.agentId === department.representativeId,
  );
  if (!anchor) throw new RangeError(`Missing representative anchor ${id}`);
  return anchor.cell;
}

function trajectoryViolations(
  frames: readonly OfficeSimulationSnapshot[],
): readonly string[] {
  const walkable = new Set(
    OFFICE_NAVIGATION_GRID.walkableCells.map(officeCellKey),
  );
  const blockedEdges = new Set(
    OFFICE_NAVIGATION_GRID.blockedEdges.map(({ from, to }) =>
      [officeCellKey(from), officeCellKey(to)].sort().join("|"),
    ),
  );
  const violations: string[] = [];
  for (const [index, frame] of frames.entries()) {
    if (frame.tick !== index) violations.push(`tick:${index}=${frame.tick}`);
    const occupied = frame.occupancy.map(({ cell }) => officeCellKey(cell));
    if (new Set(occupied).size !== occupied.length)
      violations.push(`occupancy:${frame.tick}`);
    if (occupied.some((cell) => !walkable.has(cell)))
      violations.push(`blocker:${frame.tick}`);
    const targets = frame.reservations.map(({ to }) => officeCellKey(to));
    if (new Set(targets).size !== targets.length)
      violations.push(`reservation:${frame.tick}`);
    const previous = frames[index - 1];
    if (!previous) continue;
    for (const current of frame.actors) {
      const prior = actor(previous, current.id);
      const movement = [officeCellKey(prior.cell), officeCellKey(current.cell)];
      if (
        movement[0] !== movement[1] &&
        blockedEdges.has([...movement].sort().join("|"))
      )
        violations.push(`wall:${frame.tick}:${current.id}`);
      for (const other of frame.actors) {
        if (current.id >= other.id) continue;
        const otherPrior = actor(previous, other.id);
        if (
          officeCellKey(prior.cell) === officeCellKey(other.cell) &&
          officeCellKey(otherPrior.cell) === officeCellKey(current.cell)
        )
          violations.push(`head-on:${frame.tick}:${current.id}:${other.id}`);
      }
    }
  }
  return violations;
}

test.describe("Todo 8 controlled-clock office-v7 contract", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true });
  });

  test("proves temporal choreography and deterministic replay", async ({
    page,
  }) => {
    // Given
    const audit = observeBrowser(page);
    await page.setViewportSize({ width: 1440, height: 1024 });
    await openCalibration(page);
    const initial = await page.evaluate(() => {
      const bridge = window.__STOCKSEMBLY_OFFICE_TEST__;
      if (!bridge) throw new RangeError("Office calibration bridge is missing");
      const value = bridge.snapshot();
      return {
        value,
        immutable:
          Object.isFrozen(value) &&
          Object.isFrozen(value.actors) &&
          value.actors.every(
            (entry) => Object.isFrozen(entry) && Object.isFrozen(entry.cell),
          ),
      };
    });
    const frames: OfficeSimulationSnapshot[] = [initial.value];

    // When
    for (const checkpoint of checkpointScreenshots) {
      const current = frames.at(-1);
      if (!current) throw new RangeError("Trajectory has no current frame");
      frames.push(...(await advance(page, checkpoint.tick - current.tick)));
      await page.screenshot({
        path: path.join(evidenceDir, checkpoint.name),
        fullPage: true,
      });
    }
    await writeJson("trajectory.json", frames);
    const replayFrames = await page.evaluate(() => {
      const bridge = window.__STOCKSEMBLY_OFFICE_TEST__;
      if (!bridge) throw new RangeError("Office calibration bridge is missing");
      bridge.replay();
      const values = [];
      for (let tick = 1; tick <= 1580; tick += 1) {
        bridge.advanceTicks(1);
        values.push(bridge.snapshot());
      }
      return values;
    });
    const skipped = await page.evaluate(() => {
      const bridge = window.__STOCKSEMBLY_OFFICE_TEST__;
      if (!bridge) throw new RangeError("Office calibration bridge is missing");
      bridge.replay();
      return bridge.skip();
    });
    await writeJson("browser-audit-temporal.json", audit);

    // Then
    expect(initial.immutable).toBe(true);
    expect(trajectoryViolations(frames)).toEqual([]);
    const intermediate = frames
      .slice(360, 500)
      .map((frame) => actor(frame, "market"))
      .find(({ cell }) => cell.x > 10 && cell.x < 37);
    expect(intermediate).toBeDefined();
    expect(actor(frameAt(frames, 500), "market")).toMatchObject({
      action: "orient",
      revision: actor(frameAt(frames, 499), "market").revision + 1,
    });
    expect(actor(frameAt(frames, 501), "market").action).toBe("listen");
    expect(
      [
        ...new Set(
          frames.flatMap((frame) => frame.actors.map((entry) => entry.facing)),
        ),
      ].sort(),
    ).toEqual(["down", "left", "right", "up"]);
    expect(actor(frameAt(frames, 560), "market").cell).toEqual(
      OFFICE_SCENE_MANIFEST.departments.company.visitorAnchor.cell,
    );
    expect(actor(frameAt(frames, 687), "market")).toMatchObject({
      cell: representativeCell("market"),
      action: "summarize",
    });
    expect(actor(frameAt(frames, 719), "market").cell).toEqual(
      manifestActor("market").seat.cell,
    );
    expect(actor(frameAt(frames, 920), "company").cell).toEqual(
      OFFICE_SCENE_MANIFEST.departments.financial.visitorAnchor.cell,
    );
    expect(actor(frameAt(frames, 1055), "company")).toMatchObject({
      cell: representativeCell("company"),
      action: "summarize",
    });
    expect(actor(frameAt(frames, 1079), "company").cell).toEqual(
      manifestActor("company").seat.cell,
    );
    const complete = frameAt(frames, 1580);
    const forumIds = new Set(
      OFFICE_SCENE_MANIFEST.roster
        .filter(({ finalLocation }) => finalLocation === "forum")
        .map(({ id }) => id),
    );
    expect([
      complete.actors.filter(({ id }) => forumIds.has(id)).length,
      complete.actors.filter(({ id }) => !forumIds.has(id)).length,
    ]).toEqual([5, 6]);
    for (const entry of complete.actors) {
      const member = manifestActor(entry.id);
      const forum = Object.values(OFFICE_SCENE_MANIFEST.forum.anchors).find(
        ({ agentId }) => agentId === entry.id,
      );
      expect(entry.cell).toEqual(forum?.cell ?? member.seat.cell);
    }
    expect(replayFrames).toEqual(frames.slice(1));
    expect(replayFrames.at(-1)?.traceHash).toBe(complete.traceHash);
    expect(skipped.visibleEventIds).toEqual(
      OFFICE_PUBLIC_EVENTS.map(({ id }) => id),
    );
    expect(skipped.actors).toEqual(complete.actors);
    expect(audit).toEqual({
      console: [],
      pageErrors: [],
      requestFailures: [],
      badResponses: [],
    });
  });

  test("rejects invalid advance counts without mutation", async ({ page }) => {
    // Given
    const audit = observeBrowser(page);
    await openCalibration(page);

    // When
    const results = [];
    for (const invalid of [-1, 1.5, "1"]) {
      results.push(
        await page.evaluate((value) => {
          const bridge = window.__STOCKSEMBLY_OFFICE_TEST__;
          if (!bridge)
            throw new RangeError("Office calibration bridge is missing");
          const before = bridge.snapshot();
          let rejection = "";
          try {
            Reflect.apply(bridge.advanceTicks, bridge, [value]);
          } catch (error: unknown) {
            if (!(error instanceof RangeError)) throw error;
            rejection = error.message;
          }
          return { before, after: bridge.snapshot(), rejection };
        }, invalid),
      );
    }
    await writeJson("invalid-advance.json", results);
    await writeJson("browser-audit-invalid.json", audit);

    // Then
    for (const result of results) {
      expect(result.rejection).toBe("ticks must be a non-negative integer");
      expect(result.after).toEqual(result.before);
    }
    expect(audit).toEqual({
      console: [],
      pageErrors: [],
      requestFailures: [],
      badResponses: [],
    });
  });

  test("preserves reduced-motion destinations and fresh viewport locales", async ({
    context,
    page,
  }) => {
    // Given
    const calibrationAudit = observeBrowser(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 1024 });
    await openCalibration(page);
    let currentTick = 0;

    // When
    const reducedSnapshots = [];
    for (const target of [361, 721, 1081, 1300, 1580]) {
      await advance(page, target - currentTick);
      currentTick = target;
      reducedSnapshots.push(await snapshot(page));
    }
    await page.screenshot({
      path: path.join(evidenceDir, "reduced-motion.png"),
      fullPage: true,
    });
    const enPage = await context.newPage();
    const enAudit = observeBrowser(enPage);
    await enPage.setViewportSize({ width: 1440, height: 1024 });
    await enPage.goto("/research/NVDA?lang=en");
    await expect(enPage.locator(".office-stage canvas")).toBeVisible();
    const enOffice = enPage.locator(".office-game");
    const enBeforePausePaint = await waitForPaintedOffice(enPage, enOffice);
    await enPage.getByRole("button", { name: "Pause" }).click();
    await expect(enPage.getByRole("button", { name: "Resume" })).toBeVisible();
    await expect(enPage.locator(".office-stage.is-paused")).toBeVisible();
    await expect(enOffice).toHaveAttribute("data-render-actor-count", "11");
    const enPausedPaint = await canvasPaintEvidence(enOffice);
    await enPage.screenshot({
      path: path.join(evidenceDir, "desktop.png"),
      fullPage: true,
    });
    await enPage.screenshot({
      path: path.join(evidenceDir, "en.png"),
      fullPage: true,
    });
    const koPage = await context.newPage();
    const koAudit = observeBrowser(koPage);
    await koPage.setViewportSize({ width: 390, height: 844 });
    await koPage.goto("/research/NVDA?lang=ko");
    await expect(koPage.locator(".office-stage canvas")).toBeVisible();
    const koOffice = koPage.locator(".office-game");
    const koBeforePausePaint = await waitForPaintedOffice(koPage, koOffice);
    await koPage.getByRole("button", { name: "일시정지" }).click();
    await expect(
      koPage.getByRole("button", { name: "계속하기" }),
    ).toBeVisible();
    await expect(koPage.locator(".office-stage.is-paused")).toBeVisible();
    await expect(koOffice).toHaveAttribute("data-render-actor-count", "11");
    const koPausedPaint = await canvasPaintEvidence(koOffice);
    await koPage.screenshot({
      path: path.join(evidenceDir, "mobile.png"),
      fullPage: true,
    });
    await koPage.screenshot({
      path: path.join(evidenceDir, "ko.png"),
      fullPage: true,
    });
    const overflow = await koPage.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    const activeAvatarSources = await enPage
      .locator(".department-rail img")
      .evaluateAll((images) =>
        images.map((image) =>
          decodeURIComponent(image.getAttribute("src") ?? ""),
        ),
      );
    await writeJson("reduced-motion-snapshots.json", reducedSnapshots);
    const audits = { calibrationAudit, enAudit, koAudit };
    const paintEvidence = {
      enBeforePausePaint,
      enPausedPaint,
      koBeforePausePaint,
      koPausedPaint,
    };
    await writeJson("browser-audit-visual.json", { audits, paintEvidence });

    // Then
    for (const value of reducedSnapshots) {
      expect(
        value.actors.every(
          (entry) =>
            officeCellKey(entry.cell) === officeCellKey(entry.destination),
        ),
      ).toBe(true);
    }
    expect(reducedSnapshots.at(-1)?.visibleEventIds).toEqual(
      OFFICE_PUBLIC_EVENTS.map(({ id }) => id),
    );
    expect(overflow).toBeLessThanOrEqual(1);
    expect(
      agents.every(
        ({ image, spriteSheet }) =>
          image === `/research/office-v7/portraits/${path.basename(image)}` &&
          spriteSheet ===
            `/research/office-v7/agents/${path.basename(spriteSheet)}`,
      ),
    ).toBe(true);
    expect(activeAvatarSources).not.toEqual([]);
    for (const paint of Object.values(paintEvidence)) {
      expect(paint.nonBlackPixels).toBeGreaterThan(paint.totalPixels * 0.02);
      expect(paint.distinctColors).toBeGreaterThan(16);
      expect(paint.luminanceVariance).toBeGreaterThan(1);
    }
    expect(
      activeAvatarSources.every(
        (source) =>
          source.includes("/research/office-v7/portraits/") &&
          !source.includes("/research/office-v6/"),
      ),
    ).toBe(true);
    for (const audit of Object.values(audits)) {
      expect(audit).toEqual({
        console: [],
        pageErrors: [],
        requestFailures: [],
        badResponses: [],
      });
    }
  });
});
