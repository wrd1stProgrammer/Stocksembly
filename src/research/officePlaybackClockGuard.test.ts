import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ACTIVE_RESEARCH_RUNTIME_FILES = [
  "officeActorAtlas.ts",
  "officeChoreography.ts",
  "officeChoreographyV7Contract.ts",
  "officeChoreographyV7Directives.ts",
  "officeChoreographyV7Events.ts",
  "officeFacingV7.ts",
  "officeForumChoreographyV7.ts",
  "officeGame.ts",
  "officeGameAgent.ts",
  "officeGameAnimations.ts",
  "officeGameBubble.ts",
  "officeGameBubbleState.ts",
  "officeGameConfig.ts",
  "officeGameFurniture.ts",
  "officeGameTextures.ts",
  "officeNavigation.ts",
  "officeNavigationV7Grid.ts",
  "officePlaybackCopy.ts",
  "officePlaybackView.ts",
  "officeRenderer.ts",
  "officeRendererCamera.ts",
  "officeRendererPixiFurniture.ts",
  "officeRendererPixiProjection.ts",
  "officeRendererUiLayout.ts",
  "officeSceneManifest.ts",
  "officeSimulation.ts",
  "officeSimulationV7Actors.ts",
  "officeSimulationV7TestSupport.ts",
  "officeSimulationV7TrafficMerge.ts",
  "officeSimulationV7Types.ts",
  "officeTraceV7.ts",
  "officeTrafficV7.ts",
  "officeTrafficV7State.ts",
  "mockResearch.ts",
  "types.ts",
  "useResearchPlayback.ts",
] as const;

const ACTIVE_RESEARCH_RENDER_FILES = [
  "OfficeCalibration.tsx",
  "OfficeStage.tsx",
  "PixelOfficeGame.tsx",
  "ResearchRoom.tsx",
] as const;

const EXPECTED_BROWSER_ACTIONS = [
  "home-search-to-research",
  "pause-mid-route-20-frames",
  "resume",
  "public-tabs",
  "skip-complete",
  "debate-content",
  "sources-content",
  "replay-reset",
  "report-open",
  "ko-locale",
] as const;

function readResearchFiles(
  directory: "src/research" | "src/components/research",
  fileNames: readonly string[],
): readonly string[] {
  return fileNames.map((fileName) =>
    readFileSync(`${process.cwd()}/${directory}/${fileName}`, "utf8"),
  );
}

function assertActiveClockContract(
  researchSources: readonly string[],
  renderSources: readonly string[],
): void {
  const canonicalClockSource =
    researchSources[
      ACTIVE_RESEARCH_RUNTIME_FILES.indexOf("officeChoreographyV7Contract.ts")
    ];
  if (!canonicalClockSource) {
    throw new Error("Missing canonical office clock contract source");
  }
  const activeRuntimeSource = [...researchSources, ...renderSources].join("\n");

  expect(activeRuntimeSource).not.toMatch(
    /\bdurationMs\b|\bphaseTick\b|\bsnapshotAtPhase\b|\bsetScene\b/,
  );
  const canonicalCompletionLiteralCount = (
    canonicalClockSource.match(/\b1580\b/g) ?? []
  ).length;
  const activeCompletionLiteralCount = (
    activeRuntimeSource.match(/\b1580\b/g) ?? []
  ).length;
  expect(canonicalCompletionLiteralCount).toBeGreaterThan(0);
  expect(activeCompletionLiteralCount).toBe(canonicalCompletionLiteralCount);
  expect(canonicalClockSource).toContain("completeTick: 1580");
  expect(activeRuntimeSource).toContain("OFFICE_CLOCK_CONTRACT.tickMs");
  expect(activeRuntimeSource).toContain("OFFICE_CLOCK_CONTRACT.completeTick");
}

describe("office playback clock contract", () => {
  it("does not retain a duplicate behavioral clock in active runtime files", () => {
    // Given
    const researchSources = readResearchFiles(
      "src/research",
      ACTIVE_RESEARCH_RUNTIME_FILES,
    );
    const renderSources = readResearchFiles(
      "src/components/research",
      ACTIVE_RESEARCH_RENDER_FILES,
    );
    // Then
    expect(() =>
      assertActiveClockContract(researchSources, renderSources),
    ).not.toThrow();
  });

  it("rejects a raw completion tick injected into a renderer source", () => {
    // Given
    const researchSources = readResearchFiles(
      "src/research",
      ACTIVE_RESEARCH_RUNTIME_FILES,
    );
    const renderSources = [
      ...readResearchFiles(
        "src/components/research",
        ACTIVE_RESEARCH_RENDER_FILES,
      ),
    ];
    renderSources[0] = `${renderSources[0]}\nconst accidentalCompletionTick = 1580;`;

    // Then
    expect(() =>
      assertActiveClockContract(researchSources, renderSources),
    ).toThrow();
  });

  it("requires the browser audit to prove the exact ordered action contract", () => {
    // Given
    const browserAuditSource = readFileSync(
      process.cwd() +
        "/.omo/evidence/office-v7/task-6-product/browser-audit.mjs",
      "utf8",
    );
    const expectedList = browserAuditSource.match(
      /const EXPECTED_BROWSER_ACTIONS = Object\.freeze\(\[([\s\S]*?)\]\);/,
    );
    const declaredActions = expectedList
      ? [...(expectedList[1] ?? "").matchAll(/"([^"]+)"/g)].map(
          (match) => match[1],
        )
      : [];

    // Then
    expect(declaredActions).toEqual(EXPECTED_BROWSER_ACTIONS);
    expect(browserAuditSource).toContain("expectedActionOrderPass");
    expect(browserAuditSource).toContain("actions.every(");
    expect(browserAuditSource).toContain("entry.result.pass === true");
    expect(browserAuditSource).toContain(
      "expectedActionOrderPass && strictActionPass",
    );
  });
});
