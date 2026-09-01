import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTOR_ATLAS } from "./officeActorAtlas";
import { officeAgentAssetPath } from "./officeAgentAssets";
import type { OfficeActorAction } from "./officeChoreography";
import { facingToward } from "./officeFacingV7";
import { workstationSeatVisualPosition } from "./officeGameFurniture";
import {
  type OfficeRenderSnapshot,
  renderOfficeSnapshot,
} from "./officeRenderer";
import {
  layoutOfficeUi,
  type OfficeScreenRect,
} from "./officeRendererUiLayout";
import {
  OFFICE_SCENE_MANIFEST,
  type OfficeFacing,
  type WorldPoint,
} from "./officeSceneManifest";
import {
  createOfficeSimulation,
  type OfficeActorSnapshot,
  type OfficeSimulationSnapshot,
  officeSimulationSnapshot,
  stepOfficeSimulation,
} from "./officeSimulation";

function snapshotAt(tick: number): OfficeSimulationSnapshot {
  let simulation = createOfficeSimulation();
  while (simulation.tick < tick) simulation = stepOfficeSimulation(simulation);
  return officeSimulationSnapshot(simulation);
}

function updateActor(
  snapshot: OfficeSimulationSnapshot,
  actorId: OfficeActorSnapshot["id"],
  update: (actor: OfficeActorSnapshot) => OfficeActorSnapshot,
): OfficeSimulationSnapshot {
  return Object.freeze({
    ...snapshot,
    actors: Object.freeze(
      snapshot.actors.map((actor) =>
        actor.id === actorId ? Object.freeze(update(actor)) : actor,
      ),
    ),
  });
}

function updateCameraActors(
  snapshot: OfficeSimulationSnapshot,
  actorIds: readonly OfficeActorSnapshot["id"][],
): OfficeSimulationSnapshot {
  return Object.freeze({
    ...snapshot,
    cameraTarget: Object.freeze({
      kind: "actors",
      actorIds: Object.freeze([...actorIds]),
    }),
  });
}

function project(
  snapshot: OfficeSimulationSnapshot,
  previousSnapshot?: OfficeSimulationSnapshot,
  cameraMode: "focus" | "overview" | "snapshot" = "snapshot",
  viewport = { width: 1280, height: 720 },
): OfficeRenderSnapshot {
  return renderOfficeSnapshot({
    snapshot,
    ...(previousSnapshot ? { previousSnapshot } : {}),
    interpolation: 1,
    reducedMotion: false,
    cameraMode,
    viewport,
    locale: "en",
  });
}

function movedActorSnapshot(
  snapshot: OfficeSimulationSnapshot,
  world: WorldPoint,
  facing: OfficeFacing,
  action: OfficeActorAction = "walk",
): OfficeSimulationSnapshot {
  return updateActor(snapshot, "market", (actor) => ({
    ...actor,
    action,
    facing,
    world: Object.freeze(world),
  }));
}

function overlaps(first: OfficeScreenRect, second: OfficeScreenRect): boolean {
  return !(
    first.right <= second.left ||
    first.left >= second.right ||
    first.bottom <= second.top ||
    first.top >= second.bottom
  );
}

function contained(bounds: OfficeScreenRect, width: number, height: number) {
  return (
    bounds.left >= 0 &&
    bounds.top >= 0 &&
    bounds.right <= width &&
    bounds.bottom <= height
  );
}

describe("manifest-derived office snapshot renderer", () => {
  it("applies a destination revision immediately within the same beat", () => {
    // Given
    const base = snapshotAt(360);
    // Keep Maya off her seat so the orient renders as a standing pose.
    const corridor = Object.freeze({ x: 20, y: 18 });
    const before = updateActor(base, "market", (actor) => ({
      ...actor,
      action: "walk",
      cell: corridor,
      world: cellWorld(corridor),
      destination: Object.freeze({ x: 38, y: 7 }),
      revision: 10,
    }));
    const after = updateActor(before, "market", (actor) => ({
      ...actor,
      action: "orient",
      destination: Object.freeze({ x: 37, y: 7 }),
      facing: "left",
      revision: 11,
    }));

    // When
    const first = project(before);
    const revised = project(after, before);
    const firstMaya = first.actors.find((actor) => actor.id === "market");
    const revisedMaya = revised.actors.find((actor) => actor.id === "market");

    // Then
    expect(revised.beatId).toBe(first.beatId);
    expect(revisedMaya).toMatchObject({
      action: "orient",
      destination: { x: 37, y: 7 },
      facing: "left",
      revision: 11,
    });
    expect(revisedMaya?.destination).not.toEqual(firstMaya?.destination);
  });

  it("keeps one fixed scale and feet pivot across every semantic action", () => {
    // Given
    const snapshots = [0, 40, 240, 360, 640, 1080, 1300, 1580].map(snapshotAt);

    // When
    const actors = snapshots.flatMap((snapshot) => project(snapshot).actors);

    // Then
    expect(new Set(actors.map((actor) => actor.scale))).toEqual(new Set([1]));
    expect(new Set(actors.map((actor) => JSON.stringify(actor.pivot)))).toEqual(
      new Set([JSON.stringify(ACTOR_ATLAS.footPivot)]),
    );
  });

  it("selects the directional walk row from current snapshot facing", () => {
    // Given
    const base = snapshotAt(360);
    const origin = movedActorSnapshot(base, { x: 400, y: 400 }, "down");
    const cases = [
      { world: { x: 400, y: 440 }, facing: "up", row: 3 },
      { world: { x: 360, y: 400 }, facing: "right", row: 1 },
      { world: { x: 440, y: 400 }, facing: "left", row: 2 },
      { world: { x: 400, y: 360 }, facing: "down", row: 0 },
    ] as const;

    for (const entry of cases) {
      // When
      const current = movedActorSnapshot(base, entry.world, entry.facing);
      const maya = project(current, origin).actors.find(
        (actor) => actor.id === "market",
      );

      // Then
      expect(maya?.facing).toBe(entry.facing);
      expect(maya?.frame.row).toBe(entry.row);
    }
  });

  it("uses the authoritative adjacent step for a walking sprite", () => {
    // Given
    const base = snapshotAt(360);
    const previous = updateActor(base, "market", (actor) => ({
      ...actor,
      action: "walk",
      cell: Object.freeze({ x: 10, y: 10 }),
      world: Object.freeze({ x: 336, y: 352 }),
      facing: "right",
    }));
    const current = updateActor(previous, "market", (actor) => ({
      ...actor,
      action: "walk",
      cell: Object.freeze({ x: 9, y: 10 }),
      world: Object.freeze({ x: 304, y: 352 }),
      // A stale directive-facing value must not make a left-moving actor
      // render the right-facing row.
      facing: "right",
    }));

    // When
    const maya = project(current, previous).actors.find(
      (actor) => actor.id === "market",
    );

    // Then
    expect(maya).toMatchObject({
      facing: "left",
      animation: "walk",
      frame: { row: 2, columns: [0, 1, 2, 1] },
    });
  });

  it("uses the target-facing row for orient even after opposite movement", () => {
    // Given
    const base = updateActor(snapshotAt(360), "market", (actor) => ({
      ...actor,
      // Off-seat so the orient renders as a standing pose.
      cell: Object.freeze({ x: 12, y: 12 }),
    }));
    const previous = movedActorSnapshot(base, { x: 360, y: 400 }, "right");
    const orient = movedActorSnapshot(
      base,
      { x: 400, y: 400 },
      "left",
      "orient",
    );

    // When
    const maya = project(orient, previous).actors.find(
      (actor) => actor.id === "market",
    );

    // Then
    expect(maya).toMatchObject({ facing: "left", frame: { row: 2 } });
  });

  it("orders actors by their rendered feet y coordinate", () => {
    // Given
    const base = snapshotAt(40);
    const shallow = updateActor(base, "market", (actor) => ({
      ...actor,
      world: Object.freeze({ x: 200, y: 160 }),
    }));
    const deep = updateActor(shallow, "company", (actor) => ({
      ...actor,
      world: Object.freeze({ x: 200, y: 840 }),
    }));

    // When
    const actors = project(deep).actors;
    const maya = actors.find((actor) => actor.id === "market");
    const ethan = actors.find((actor) => actor.id === "company");

    // Then
    expect(ethan?.zIndex).toBeGreaterThan(maya?.zIndex ?? Number.MAX_VALUE);
  });

  it("fits desktop overview and focused active bounds with calm room context inside the world", () => {
    // Given
    const overviewSnapshot = snapshotAt(40);
    const focusBase = snapshotAt(360);
    const nearTopLeft = updateActor(focusBase, "market", (actor) => ({
      ...actor,
      world: Object.freeze({ x: 20, y: 40 }),
    }));
    const twoActors = updateActor(nearTopLeft, "company", (actor) => ({
      ...actor,
      world: Object.freeze({ x: 200, y: 100 }),
    }));
    const focusedSnapshot = updateCameraActors(twoActors, [
      "market",
      "company",
    ]);

    // When
    const overview = project(overviewSnapshot, undefined, "overview", {
      width: 1280,
      height: 720,
    }).camera;
    const focus = project(focusedSnapshot, undefined, "focus", {
      width: 390,
      height: 844,
    }).camera;
    const desktopFocus = project(focusedSnapshot, undefined, "focus", {
      width: 1280,
      height: 720,
    }).camera;

    // Then
    expect(overview).toMatchObject({
      mode: "overview",
      activeBounds: {
        left: 0,
        top: 0,
        right: OFFICE_SCENE_MANIFEST.world.width,
        bottom: OFFICE_SCENE_MANIFEST.world.height,
      },
      visibleWorldBounds: {
        left: 0,
        top: 0,
        right: OFFICE_SCENE_MANIFEST.world.width,
        bottom: OFFICE_SCENE_MANIFEST.world.height,
      },
    });
    expect(focus.activeBounds).toEqual({
      left: 0,
      top: 0,
      right: 296,
      bottom: 196,
    });
    expect(focus.visibleWorldBounds.left).toBeGreaterThanOrEqual(0);
    expect(focus.visibleWorldBounds.top).toBeGreaterThanOrEqual(0);
    expect(focus.visibleWorldBounds.right).toBeLessThanOrEqual(
      OFFICE_SCENE_MANIFEST.world.width,
    );
    expect(focus.visibleWorldBounds.bottom).toBeLessThanOrEqual(
      OFFICE_SCENE_MANIFEST.world.height,
    );
    expect(focus.visibleWorldBounds.left).toBeLessThanOrEqual(
      focus.activeBounds.left,
    );
    expect(focus.visibleWorldBounds.top).toBeLessThanOrEqual(
      focus.activeBounds.top,
    );
    expect(focus.visibleWorldBounds.right).toBeGreaterThanOrEqual(
      focus.activeBounds.right,
    );
    expect(focus.visibleWorldBounds.bottom).toBeGreaterThanOrEqual(
      focus.activeBounds.bottom,
    );
    expect(focus.visibleWorldBounds.left).toBeLessThanOrEqual(0);
    expect(focus.visibleWorldBounds.top).toBeLessThanOrEqual(0);
    expect(focus.visibleWorldBounds.right).toBeGreaterThanOrEqual(280);
    expect(desktopFocus.scale).toBeLessThanOrEqual(1.2);
    expect(desktopFocus.scale).toBeGreaterThan(overview.scale);
  });

  it("derives all twelve actors and v8 paths without ticker-owned behavior", () => {
    // Given
    const source = readFileSync(
      resolve(process.cwd(), "src/research/officeGame.ts"),
      "utf8",
    );

    // When
    const rendered = project(snapshotAt(40));

    // Then
    expect(rendered.actors).toHaveLength(OFFICE_SCENE_MANIFEST.roster.length);
    expect(
      rendered.actors.every(
        (actor) => actor.assetPath === officeAgentAssetPath(actor.id),
      ),
    ).toBe(true);
    expect(source).not.toMatch(/app\.ticker\.add|moveAgent\(|elapsedMs\s*\+=/);
    expect(source).not.toMatch(/LEGACY_AGENT_IDS|\/research\/office-v6/);
    expect(source).not.toMatch(/Math\.random|setInterval|setTimeout/);
  });

  it("moves only personal-workstation seated actors with their tightened chairs", () => {
    const workSnapshot = snapshotAt(80);
    const workProjection = project(workSnapshot);
    const workActor = workSnapshot.actors.find(({ id }) => id === "market");
    const renderedWorkActor = workProjection.actors.find(
      ({ id }) => id === "market",
    );
    const meetingSnapshot = snapshotAt(340);
    const meetingProjection = project(meetingSnapshot);
    const meetingActor = meetingSnapshot.actors.find(
      ({ id }) => id === "market_news",
    );
    const renderedMeetingActor = meetingProjection.actors.find(
      ({ id }) => id === "market_news",
    );

    expect(workActor).toBeDefined();
    expect(renderedWorkActor?.world).toEqual(
      workstationSeatVisualPosition("market"),
    );
    expect(renderedMeetingActor?.world.y).toBe(meetingActor?.world.y);
  });

  it("lays out desktop bubbles and labels without overlap or clipped actor fragments", () => {
    // Given
    const viewport = { width: 1376, height: 774 };
    const projection = project(
      snapshotAt(530),
      undefined,
      "snapshot",
      viewport,
    );

    // When
    const layouts = layoutOfficeUi({ projection, viewport });
    const labels = layouts.filter((layout) => layout.label.visible);
    const bubbles = layouts.filter((layout) => layout.bubble.visible);

    // Then
    for (const label of labels) {
      expect(label.label.bounds.top - label.bodyBounds.bottom).toBe(1);
      const labelCenter =
        (label.label.bounds.left + label.label.bounds.right) / 2;
      const labelWidth = label.label.bounds.right - label.label.bounds.left;
      expect(
        Math.abs(labelCenter - label.screenPosition.x),
      ).toBeLessThanOrEqual(labelWidth * 0.32 + 0.001);
      for (const bubble of bubbles) {
        expect(overlaps(label.label.bounds, bubble.bubble.bounds)).toBe(false);
      }
    }
    expect(labels).toHaveLength(
      projection.actors.filter((actor) => actor.active).length,
    );
    for (const [index, label] of labels.entries()) {
      for (const other of labels.slice(index + 1)) {
        expect(overlaps(label.label.bounds, other.label.bounds)).toBe(false);
      }
    }
    for (const [index, bubble] of bubbles.entries()) {
      for (const actor of layouts.filter((layout) => layout.bodyVisible)) {
        expect(overlaps(bubble.bubble.bounds, actor.bodyBounds)).toBe(false);
      }
      for (const other of bubbles.slice(index + 1)) {
        expect(overlaps(bubble.bubble.bounds, other.bubble.bounds)).toBe(false);
      }
    }
    const speaking = bubbles[0];
    expect(speaking).toBeDefined();
    if (speaking !== undefined) {
      const tether = speaking.bodyBounds.top - speaking.bubble.bounds.bottom;
      expect(tether).toBeGreaterThanOrEqual(1);
      expect(tether).toBeLessThanOrEqual(12);
    }
    expect(
      layouts
        .filter((layout) => layout.bodyVisible)
        .every((layout) =>
          contained(layout.bodyBounds, viewport.width, viewport.height),
        ),
    ).toBe(true);
  });

  it("keeps a speaker bubble tethered when furniture occupies the background", () => {
    // Given
    const viewport = { width: 1376, height: 774 };
    const projection = project(
      snapshotAt(530),
      undefined,
      "snapshot",
      viewport,
    );
    const activeBubble = projection.actors.find(
      (actor) => actor.active && actor.bubble.visible,
    );
    if (!activeBubble) throw new Error("Expected an active bubble");
    const camera = projection.camera;
    const centerX = camera.x + activeBubble.world.x * camera.scale;
    const obstacle = {
      left: centerX - 90,
      top: 0,
      right: centerX + 90,
      bottom: viewport.height,
    };

    // When
    const layout = layoutOfficeUi({
      projection,
      viewport,
      obstacles: [obstacle],
    }).find((candidate) => candidate.actorId === activeBubble.id);

    // Then
    expect(layout?.bubble.visible).toBe(true);
    if (layout?.bubble.visible) {
      expect(layout.bodyBounds.top - layout.bubble.bounds.bottom).toBe(1);
    }
  });

  it("renders remote transcript bubbles without making seated actors stand or face through walls", () => {
    const snapshot = snapshotAt(40);
    const viewport = { width: 1376, height: 774 };

    const projection = renderOfficeSnapshot({
      snapshot,
      interpolation: 1,
      reducedMotion: false,
      cameraMode: "overview",
      viewport,
      locale: "ko",
      liveBubbles: [
        { actorId: "market", message: "금리와 시장 흐름을 확인했습니다" },
        { actorId: "company", message: "제품 수요 근거를 확인했습니다" },
      ],
      conversation: {
        speakerId: "market",
        participantIds: ["market", "company"],
      },
    });
    const market = projection.actors.find((actor) => actor.id === "market");
    const company = projection.actors.find((actor) => actor.id === "company");
    const layouts = layoutOfficeUi({ projection, viewport }).filter(
      (layout) => layout.bubble.visible,
    );

    expect(market).toMatchObject({
      action: "seated-work",
      visualPose: "seated-talk",
      animation: "sit",
      bubble: { visible: true },
    });
    expect(company).toMatchObject({
      action: "seated-work",
      visualPose: "seated-listen",
      animation: "sit",
      bubble: { visible: true },
    });
    expect(market?.facing).toBe("down");
    expect(company?.facing).toBe("down");
    expect(layouts).toHaveLength(2);
    const [firstBubble, secondBubble] = layouts;
    if (firstBubble === undefined || secondBubble === undefined) {
      throw new TypeError("Expected two visible live bubbles");
    }
    for (const layout of [firstBubble, secondBubble]) {
      const centerX =
        (layout.bubble.bounds.left + layout.bubble.bounds.right) / 2;
      expect(Math.abs(centerX - layout.screenPosition.x)).toBeLessThanOrEqual(
        40,
      );
      expect(layout.bubble.bounds.bottom).toBe(layout.bodyBounds.top - 1);
    }
    expect(
      overlaps(firstBubble.bubble.bounds, secondBubble.bubble.bounds),
    ).toBe(false);
  });

  it("bounds live transcript text before it reaches Pixi", () => {
    const longMessage =
      "NVIDIA's reported economics support premium valuation while revenue, margin, and cash conversion still require separate evidence checks.";
    const market = renderOfficeSnapshot({
      snapshot: snapshotAt(40),
      interpolation: 1,
      reducedMotion: false,
      cameraMode: "overview",
      viewport: { width: 1376, height: 774 },
      locale: "en",
      liveBubbles: [{ actorId: "market", message: longMessage }],
    }).actors.find((actor) => actor.id === "market");

    expect(market?.bubble.visible).toBe(true);
    expect(market?.bubble.message.length).toBeGreaterThan(46);
    expect(market?.bubble.message.length).toBeLessThanOrEqual(130);
    expect(market?.bubble.message).not.toBe(longMessage);
  });

  it("suppresses a live transcript while its actor is still travelling", () => {
    const base = snapshotAt(40);
    const travelling = updateActor(base, "market", (actor) => ({
      ...actor,
      action: "walk",
      destination: Object.freeze({ x: actor.cell.x + 1, y: actor.cell.y }),
      motion: Object.freeze({
        from: actor.cell,
        to: Object.freeze({ x: actor.cell.x + 1, y: actor.cell.y }),
        elapsedTicks: 1,
        durationTicks: 2,
      }),
    }));

    const maya = renderOfficeSnapshot({
      snapshot: travelling,
      interpolation: 0.9,
      reducedMotion: false,
      cameraMode: "overview",
      viewport: { width: 1376, height: 774 },
      locale: "ko",
      liveBubbles: [{ actorId: "market", message: "이동 중 대사" }],
    }).actors.find((actor) => actor.id === "market");

    expect(maya?.bubble).toEqual({ visible: false, message: "" });
  });

  it("keeps mobile active UI readable and fully frames active return actors", () => {
    // Given
    const viewport = { width: 354, height: 200 };
    const visit = project(snapshotAt(520), undefined, "snapshot", viewport);
    const returning = project(snapshotAt(650), undefined, "snapshot", viewport);

    // When
    const visitLayouts = layoutOfficeUi({ projection: visit, viewport });
    const returnLayouts = layoutOfficeUi({ projection: returning, viewport });

    // Then
    expect(
      visitLayouts
        .filter((layout) => layout.label.visible)
        .every((layout) => layout.label.screenFontSize >= 14),
    ).toBe(true);
    expect(
      visitLayouts
        .filter((layout) => layout.bubble.visible)
        .every(
          (layout) =>
            layout.bubble.screenFontSize >= 11 && layout.bubble.scale > 1,
        ),
    ).toBe(true);
    expect(
      visitLayouts
        .filter((layout) => layout.uiVisible)
        .every(
          (layout) =>
            (!layout.label.visible ||
              contained(
                layout.label.bounds,
                viewport.width,
                viewport.height,
              )) &&
            (!layout.bubble.visible ||
              contained(layout.bubble.bounds, viewport.width, viewport.height)),
        ),
    ).toBe(true);
    expect(
      returnLayouts
        .filter(
          (layout) =>
            returning.actors.find((actor) => actor.id === layout.actorId)
              ?.active,
        )
        .every(
          (layout) =>
            layout.bodyVisible &&
            contained(layout.bodyBounds, viewport.width, viewport.height),
        ),
    ).toBe(true);
  });

  it("lets a mobile focus camera override overview with the active speaker", () => {
    const viewport = { width: 354, height: 360 };
    const projection = renderOfficeSnapshot({
      snapshot: snapshotAt(80),
      cameraMode: "focus",
      cameraActorIds: ["company"],
      viewport,
      locale: "ko",
    });
    const layouts = layoutOfficeUi({ projection, viewport });
    const company = projection.actors.find((actor) => actor.id === "company");
    const companyLayout = layouts.find(
      (layout) => layout.actorId === "company",
    );

    expect(projection.camera.mode).toBe("focus");
    expect(projection.camera.scale).toBeGreaterThan(1);
    expect(company?.active).toBe(true);
    expect(projection.actors.filter((actor) => actor.active)).toHaveLength(1);
    expect(companyLayout?.bodyVisible).toBe(true);
    expect(companyLayout).toBeDefined();
    if (companyLayout !== undefined)
      expect(
        contained(companyLayout.bodyBounds, viewport.width, viewport.height),
      ).toBe(true);
  });
});

function cellWorld(cell: {
  readonly x: number;
  readonly y: number;
}): WorldPoint {
  const size = OFFICE_SCENE_MANIFEST.world.cellSize;
  return Object.freeze({ x: cell.x * size + size / 2, y: (cell.y + 1) * size });
}

function rosterMemberOrThrow(id: "market" | "market_news") {
  const member = OFFICE_SCENE_MANIFEST.roster.find((entry) => entry.id === id);
  if (member === undefined) throw new TypeError(`Roster has no ${id}`);
  return member;
}

describe("walking and seated facing", () => {
  const viewport = { width: 1376, height: 1145 };

  it("keeps a walking actor facing its travel direction while a conversation counterpart shares the room", () => {
    // Given: June sits at her desk; Maya walks past two rows above, heading right.
    const base = snapshotAt(360);
    const counterpartSeat = rosterMemberOrThrow("market_news").workSeat.cell;
    const from = Object.freeze({
      x: counterpartSeat.x + 1,
      y: counterpartSeat.y - 2,
    });
    const to = Object.freeze({
      x: counterpartSeat.x + 2,
      y: counterpartSeat.y - 2,
    });
    const seated = updateActor(base, "market_news", (actor) => ({
      ...actor,
      action: "seated-work",
      cell: counterpartSeat,
      world: cellWorld(counterpartSeat),
      facing: "down",
    }));
    const previous = updateActor(seated, "market", (actor) => ({
      ...actor,
      action: "walk",
      cell: from,
      world: cellWorld(from),
      facing: "right",
    }));
    const moved = updateActor(previous, "market", (actor) => ({
      ...actor,
      cell: to,
      world: cellWorld(to),
    }));
    const conversation = {
      speakerId: "market_news",
      participantIds: ["market", "market_news"],
    } as const;
    const render = (
      snapshot: OfficeSimulationSnapshot,
      previousSnapshot: OfficeSimulationSnapshot,
    ) =>
      renderOfficeSnapshot({
        snapshot,
        previousSnapshot,
        interpolation: 1,
        reducedMotion: false,
        cameraMode: "overview",
        viewport,
        locale: "en",
        conversation,
      }).actors.find((actor) => actor.id === "market");

    // When: the cell changes on one tick and holds on the next.
    const onArrival = render(moved, previous);
    const betweenCells = render(moved, moved);

    // Then: both ticks keep the travel direction instead of turning to June.
    expect(onArrival).toMatchObject({
      animation: "walk",
      facing: "right",
      frame: { row: 1, columns: [0, 1, 2, 1] },
    });
    expect(betweenCells).toMatchObject({
      animation: "walk",
      facing: "right",
      frame: { row: 1, columns: [0, 1, 2, 1] },
    });

    // And: once the feet stop, the counterpart override applies again.
    const stopped = updateActor(moved, "market", (actor) => ({
      ...actor,
      action: "idle",
    }));
    expect(render(stopped, moved)?.facing).toBe(
      facingToward(to, counterpartSeat),
    );
  });

  it("renders the seat facing on the tick an actor arrives at its seat", () => {
    // Given: Maya reaches her own work seat from the left, still facing right.
    const base = snapshotAt(360);
    const seat = rosterMemberOrThrow("market").workSeat;
    const approach = Object.freeze({ x: seat.cell.x - 1, y: seat.cell.y });
    const previous = updateActor(base, "market", (actor) => ({
      ...actor,
      action: "walk",
      cell: approach,
      world: cellWorld(approach),
      facing: "right",
    }));
    const arrived = updateActor(previous, "market", (actor) => ({
      ...actor,
      action: "orient",
      cell: seat.cell,
      world: cellWorld(seat.cell),
      facing: "right",
    }));

    // When
    const maya = project(arrived, previous).actors.find(
      (actor) => actor.id === "market",
    );

    // Then: no sideways seated frame while the simulation catches up.
    expect(seat.facing).toBe("down");
    expect(maya).toMatchObject({
      animation: "sit",
      facing: "down",
      frame: { row: 0, columns: [3] },
    });
  });
});
