import { describe, expect, it } from "vitest";
import {
  OFFICE_BEAT_SCHEDULE,
  OFFICE_CLOCK_CONTRACT,
  officeBeatAt,
} from "./officeChoreography";
import {
  createNavigationGrid,
  OFFICE_NAVIGATION_GRID,
  officeCellKey,
} from "./officeNavigation";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";
import {
  advanceOfficeFrame,
  createOfficeFrame,
  createOfficeSimulation,
  type OfficeActorSnapshot,
  officeSimulationSnapshot,
  replayOfficeSimulation,
  setOfficeSimulationPaused,
  skipOfficeSimulation,
  stepOfficeSimulation,
} from "./officeSimulation";
import {
  actor,
  EXPECTED_OFFICE_BEAT_SCHEDULE,
  EXPECTED_OFFICE_EVENT_LEDGER,
  manifestActor,
  representativeCell,
  runTo,
  semanticActors,
} from "./officeSimulationV7TestSupport";

describe("office fixed-tick simulation", () => {
  it("locks the exact fixed clock and inclusive beat schedule", () => {
    // Given
    // Then
    expect(OFFICE_CLOCK_CONTRACT).toEqual({
      tickMs: 50,
      maxCatchUpTicks: 5,
      maxFrameDeltaMs: 250,
      completeTick: 1580,
    });
    expect(OFFICE_BEAT_SCHEDULE).toEqual(EXPECTED_OFFICE_BEAT_SCHEDULE);
    for (const { id, startTick, endTick } of EXPECTED_OFFICE_BEAT_SCHEDULE) {
      expect([officeBeatAt(startTick).id, officeBeatAt(endTick).id]).toEqual([
        id,
        id,
      ]);
    }
  });

  it("exposes one canonical department field on every snapshot actor", () => {
    // Given
    const expected = OFFICE_SCENE_MANIFEST.roster.map((member) => [
      member.id,
      member.departmentId,
    ]);

    // When
    const actual = officeSimulationSnapshot(
      createOfficeSimulation(),
    ).actors.map(({ id, department }) => [id, department]);

    // Then
    expect(actual).toEqual(expected);
  });

  it("clamps browser gaps, catches up at most five ticks, and freezes while paused", () => {
    // Given
    const initial = createOfficeFrame(createOfficeSimulation());

    // When
    const caughtUp = advanceOfficeFrame(initial, 1_000);
    const paused = {
      ...caughtUp,
      simulation: setOfficeSimulationPaused(caughtUp.simulation, true),
    };
    const frozen = advanceOfficeFrame(paused, 250);

    // Then
    expect(caughtUp.simulation.tick).toBe(5);
    expect(caughtUp.accumulatorMs).toBe(0);
    expect(caughtUp.interpolation).toBe(0);
    expect(frozen).toEqual(paused);
  });

  it("walks intermediate cells and applies same-beat revisions", () => {
    // Given
    let state = runTo(359);
    const mayaAtTalk = actor(state, "market");
    let prior = mayaAtTalk;
    let sawIntermediate = false;

    // When
    while (state.tick < 520) {
      state = stepOfficeSimulation(state);
      const current = actor(state, "market");
      const distance =
        Math.abs(current.cell.x - prior.cell.x) +
        Math.abs(current.cell.y - prior.cell.y);
      if (distance === 1 && current.cell.x > 5 && current.cell.x < 38) {
        sawIntermediate = true;
      }
      prior = current;
    }

    // Then
    expect(mayaAtTalk.cell).toEqual(
      OFFICE_SCENE_MANIFEST.departments.market.talkAnchors[0]?.cell,
    );
    expect(sawIntermediate).toBe(true);
    expect(officeBeatAt(499).id).toBe(officeBeatAt(500).id);
    const revised = actor(runTo(500), "market");
    expect(revised.revision).toBeGreaterThan(
      actor(runTo(499), "market").revision,
    );
    expect(revised.action).toBe("orient");
    expect(actor(runTo(501), "market").action).toBe("listen");
  });

  it("executes both visit/return waves and leaves exactly five at forum", () => {
    // Given
    const visitA = runTo(530);
    const returnASummary = runTo(680);
    const returnA = runTo(719);
    const visitB = runTo(890);
    const returnBSummary = runTo(1055);
    const returnB = runTo(1079);
    const departmentTalk = runTo(340);

    // When
    const complete = skipOfficeSimulation(createOfficeSimulation());
    const snapshot = officeSimulationSnapshot(complete);
    const forumIds: ReadonlySet<OfficeActorSnapshot["id"]> = new Set(
      OFFICE_SCENE_MANIFEST.roster
        .filter((member) => member.finalLocation === "forum")
        .map((member) => member.id),
    );
    const forumActors = snapshot.actors.filter((member) =>
      forumIds.has(member.id),
    );

    // Then
    expect(actor(visitA, "market").cell).toEqual(
      OFFICE_SCENE_MANIFEST.departments.company.visitorAnchor.cell,
    );
    expect(actor(visitA, "financial").cell).toEqual(
      OFFICE_SCENE_MANIFEST.departments.risk.visitorAnchor.cell,
    );
    expect(actor(visitB, "company").cell).toEqual(
      OFFICE_SCENE_MANIFEST.departments.financial.visitorAnchor.cell,
    );
    expect(actor(visitB, "risk").cell).toEqual(
      OFFICE_SCENE_MANIFEST.departments.market.visitorAnchor.cell,
    );
    for (const [summary, visitors] of [
      [returnASummary, ["market", "financial"]],
      [returnBSummary, ["company", "risk"]],
    ] as const) {
      for (const visitor of visitors) {
        expect(actor(summary, visitor)).toMatchObject({
          cell: representativeCell(visitor),
          action: "summarize",
        });
      }
    }
    for (const state of [returnA, returnB]) {
      for (const participant of [
        "market",
        "company",
        "financial",
        "risk",
      ] as const) {
        expect(actor(state, participant)).toMatchObject({
          cell: representativeCell(participant),
          action: "summarize",
        });
      }
    }
    for (const department of Object.values(OFFICE_SCENE_MANIFEST.departments)) {
      for (const memberId of department.memberIds) {
        expect(actor(departmentTalk, memberId).action).toBe(
          memberId === department.representativeId ? "talk" : "listen",
        );
      }
    }
    expect(actor(visitA, "market").action).toBe("listen");
    expect(actor(visitA, "company").action).toBe("talk");
    expect(actor(visitA, "financial").action).toBe("listen");
    expect(actor(visitA, "risk").action).toBe("talk");
    expect(actor(visitB, "company").action).toBe("listen");
    expect(actor(visitB, "financial").action).toBe("talk");
    expect(actor(visitB, "risk").action).toBe("listen");
    expect(actor(visitB, "market").action).toBe("talk");
    expect([
      forumActors.length,
      snapshot.actors.length - forumActors.length,
    ]).toEqual([5, 7]);
    expect(forumActors.every((member) => member.action === "idle")).toBe(true);
    for (const member of snapshot.actors) {
      const manifestMember = manifestActor(member.id);
      const forumAnchor = Object.values(
        OFFICE_SCENE_MANIFEST.forum.anchors,
      ).find((candidate) => candidate.agentId === member.id);
      if (manifestMember.finalLocation === "forum" && !forumAnchor) {
        throw new RangeError(`Missing forum anchor ${member.id}`);
      }
      const expected = forumAnchor?.cell ?? manifestMember.seat.cell;
      expect(member.cell).toEqual(expected);
    }
  });

  it("emits a public route failure and preserves the last valid cell", () => {
    // Given
    const marketDoors = new Set(
      OFFICE_SCENE_MANIFEST.rooms.market.doors.map(officeCellKey),
    );
    const blockedGrid = createNavigationGrid({
      columns: OFFICE_NAVIGATION_GRID.columns,
      rows: OFFICE_NAVIGATION_GRID.rows,
      walkableCells: OFFICE_NAVIGATION_GRID.walkableCells.filter(
        (candidate) => !marketDoors.has(officeCellKey(candidate)),
      ),
      yieldAnchors: OFFICE_NAVIGATION_GRID.yieldAnchors,
      blockedEdges: OFFICE_NAVIGATION_GRID.blockedEdges,
    });
    const before = runTo(359, { navigationGrid: blockedGrid });

    // When
    const failed = stepOfficeSimulation(before);

    // Then
    expect(actor(failed, "market").cell).toEqual(actor(before, "market").cell);
    expect(
      failed.events.find(
        (event) => event.kind === "route-failure" && event.actorId === "market",
      ),
    ).toMatchObject({ status: "route-unavailable" });
  });

  it("keeps skip, replay, reduced motion, ledger, and trace semantics deterministic", () => {
    // Given
    const first = skipOfficeSimulation(createOfficeSimulation());
    const second = skipOfficeSimulation(createOfficeSimulation());
    const reduced = skipOfficeSimulation(
      createOfficeSimulation({ reducedMotion: true }),
    );

    // When
    const replayed = skipOfficeSimulation(replayOfficeSimulation(first));
    const reset = replayOfficeSimulation(first);
    const firstSnapshot = officeSimulationSnapshot(first);
    const reducedSnapshot = officeSimulationSnapshot(reduced);

    // Then
    expect(first.events.map((event) => event.id)).toEqual(
      EXPECTED_OFFICE_EVENT_LEDGER,
    );
    expect(
      Object.isFrozen(firstSnapshot) &&
        Object.isFrozen(firstSnapshot.actors[0]),
    ).toBe(true);
    expect(first.trace).toEqual(second.trace);
    expect(firstSnapshot.traceHash).toBe(
      officeSimulationSnapshot(second).traceHash,
    );
    expect(firstSnapshot.traceHash).toBe(
      officeSimulationSnapshot(replayed).traceHash,
    );
    expect(replayed.trace).toEqual(first.trace);
    expect(officeSimulationSnapshot(reset)).toEqual(
      officeSimulationSnapshot(createOfficeSimulation()),
    );
    expect(first.actors.map((member) => member.priority)).toEqual(
      OFFICE_SCENE_MANIFEST.roster.map((_, index) => index),
    );
    expect(reduced.events.map((event) => event.id)).toEqual(
      EXPECTED_OFFICE_EVENT_LEDGER,
    );
    expect(reducedSnapshot.tick).toBe(firstSnapshot.tick);
    expect(semanticActors(reduced)).toEqual(semanticActors(first));
    expect(actor(runTo(361, { reducedMotion: true }), "market").cell).toEqual(
      OFFICE_SCENE_MANIFEST.departments.company.visitorAnchor.cell,
    );
    expect(actor(runTo(361), "market").cell).not.toEqual(
      OFFICE_SCENE_MANIFEST.departments.company.visitorAnchor.cell,
    );
  });
});
