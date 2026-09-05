import { describe, expect, it } from "vitest";
import {
  DEFAULT_OFFICE_DEPARTMENT_RELEASE_ORDER,
  OFFICE_DEPARTMENT_TALK_TIMELINE,
  OFFICE_ENTRY_TIMELINE,
} from "../officeChoreography";
import { renderOfficeSnapshot } from "../officeRenderer";
import { OFFICE_SCENE_MANIFEST } from "../officeSceneManifest";
import {
  createOfficeSimulation,
  type OfficeActorSnapshot,
  type OfficeSimulationSnapshot,
  officeSimulationSnapshot,
  stepOfficeSimulation,
} from "../officeSimulation";
import { destinationFor, knownDestination } from "./destinations";
import { FORUM_PLACES, ROSTER, TEAM_TABLES } from "./layout";
import { LiveOfficeScene } from "./liveScene";
import { clearFloorSegment, findMotionRoute, isFloorPoint } from "./navigation";

const initial = officeSimulationSnapshot(createOfficeSimulation());
const options = { reducedMotion: false, paused: false };
function actor(id: OfficeActorSnapshot["id"]): OfficeActorSnapshot {
  const source = initial.actors.find((entry) => entry.id === id);
  if (!source) throw new RangeError(id);
  return source;
}
function snapshot(
  actors: readonly OfficeActorSnapshot[],
  tick = 1,
): OfficeSimulationSnapshot {
  return { ...initial, tick, actors };
}

describe("approved office live adapter", () => {
  it("maps real personal, team and forum destinations without adding missing team members", () => {
    for (const source of initial.actors) {
      const member = OFFICE_SCENE_MANIFEST.roster.find(
        (entry) => entry.id === source.id,
      );
      if (!member) throw new RangeError(source.id);
      expect(
        destinationFor({ ...source, destination: member.workSeat.cell })
          .position,
      ).toEqual(ROSTER.find((entry) => entry.id === source.id)?.seat);
      if (source.id !== "chair") {
        const team = destinationFor({
          ...source,
          destination: member.meetingSeat.cell,
        });
        expect(team.position).toEqual(
          TEAM_TABLES.flatMap((table) => table.seats).find(
            (seat) => seat.id === source.id,
          )?.position,
        );
        expect(team.seated).toBe(true);
      }
    }
    const forumActors = Object.entries(OFFICE_SCENE_MANIFEST.forum.anchors).map(
      ([id, anchor]) => {
        const source = initial.actors.find((entry) => entry.id === id);
        if (!source) throw new RangeError(id);
        return {
          ...source,
          cell: anchor.cell,
          destination: anchor.cell,
          action: "listen" as const,
        };
      },
    );
    const scene = new LiveOfficeScene().update(
      snapshot(forumActors),
      undefined,
      0,
      options,
    );
    expect(scene.actors).toHaveLength(5);
    expect(scene.actors.every((entry) => entry.seated)).toBe(true);
    for (const entry of scene.actors)
      expect(entry.position).toEqual(
        Object.entries(FORUM_PLACES).find(([id]) => entry.id === id)?.[1]
          .position,
      );
    const teamSubset = new LiveOfficeScene().update(
      snapshot(initial.actors.slice(0, 3)),
      undefined,
      0,
      options,
    );
    expect(teamSubset.actors.map((entry) => entry.id)).toEqual([
      "market",
      "market_news",
      "benchmark",
    ]);
  });

  it("routes between actual department, visitor and forum access points around the furnished floor", () => {
    const failures: string[] = [];
    for (const source of initial.actors) {
      const member = OFFICE_SCENE_MANIFEST.roster.find(
        (entry) => entry.id === source.id,
      );
      if (!member) throw new RangeError(source.id);
      const start = destinationFor(source);
      const team = knownDestination(source.id, member.meetingSeat.cell);
      const forumAnchor = Object.entries(
        OFFICE_SCENE_MANIFEST.forum.anchors,
      ).find(([id]) => id === source.id)?.[1];
      const forum = forumAnchor
        ? knownDestination(source.id, forumAnchor.cell)
        : undefined;
      const targets = [team, forum].filter((entry) => entry !== undefined);
      if (
        source.id === "market" ||
        source.id === "company" ||
        source.id === "financial" ||
        source.id === "risk"
      ) {
        for (const department of Object.values(
          OFFICE_SCENE_MANIFEST.departments,
        )) {
          const visit = knownDestination(
            source.id,
            department.visitorAnchor.cell,
          );
          if (visit) targets.push(visit);
        }
      }
      for (const target of targets) {
        const route = findMotionRoute(start.approach, target.approach);
        if (
          route.length === 0 ||
          !route.every((point) => isFloorPoint(point)) ||
          !route
            .slice(1)
            .every((point, index) =>
              clearFloorSegment(route[index] ?? point, point),
            )
        )
          failures.push(
            `${source.id} -> ${target.key}: ${route.length} points; start ${isFloorPoint(start.approach)} target ${isFloorPoint(target.approach)}`,
          );
      }
    }
    expect(failures).toEqual([]);
  });

  it("walks and seats continuously while withholding real speech until visual arrival", () => {
    const member = OFFICE_SCENE_MANIFEST.roster[0];
    const source = {
      ...actor("market"),
      cell: member.workSeat.cell,
      destination: member.workSeat.cell,
    };
    const target = {
      ...source,
      cell: member.meetingSeat.cell,
      destination: member.meetingSeat.cell,
      action: "talk" as const,
    };
    const live = new LiveOfficeScene();
    live.update(snapshot([source]), undefined, 0, options);
    const original = renderOfficeSnapshot({
      snapshot: snapshot([target], 2),
      locale: "en",
      viewport: { width: 1000, height: 800 },
    });
    const projection = {
      ...original,
      actors: original.actors.map((entry) => ({
        ...entry,
        bubble: { visible: true, message: "Actual research event" },
      })),
    };
    let frame = live.update(snapshot([target], 2), projection, 1 / 60, options);
    expect(frame.actors[0]?.action).toBe("stand");
    expect(frame.actors[0]?.speech).toBeNull();
    let maximumStep = 0;
    for (let step = 0; step < 900; step += 1) {
      const previous = frame.actors[0]?.position;
      frame = live.update(snapshot([target], 2), projection, 1 / 60, options);
      const current = frame.actors[0]?.position;
      if (previous && current)
        maximumStep = Math.max(
          maximumStep,
          Math.hypot(current.x - previous.x, current.y - previous.y),
        );
    }
    expect(maximumStep).toBeLessThanOrEqual(104 / 60 + 0.001);
    expect(frame.actors[0]?.seated).toBe(true);
    expect(frame.actors[0]?.speech).toBe("Actual research event");
    expect(frame.actors[0]?.position).toEqual(
      TEAM_TABLES[0]?.seats[0]?.position,
    );
  });

  it("settles a committed team seat before following a visit and exposing its speech", () => {
    const member = OFFICE_SCENE_MANIFEST.roster[0];
    const source = {
      ...actor("market"),
      cell: member.workSeat.cell,
      destination: member.workSeat.cell,
    };
    const team = {
      ...source,
      cell: member.meetingSeat.cell,
      destination: member.meetingSeat.cell,
      action: "talk" as const,
    };
    const visit = {
      ...team,
      cell: OFFICE_SCENE_MANIFEST.departments.company.visitorAnchor.cell,
      destination: OFFICE_SCENE_MANIFEST.departments.company.visitorAnchor.cell,
    };
    const rendered = renderOfficeSnapshot({
      snapshot: snapshot([visit], 3),
      locale: "en",
      viewport: { width: 1000, height: 800 },
    });
    const projection = {
      ...rendered,
      actors: rendered.actors.map((entry) => ({
        ...entry,
        bubble: { visible: true, message: "Visit update" },
      })),
    };
    const live = new LiveOfficeScene();
    live.update(snapshot([source]), undefined, 0, options);
    live.update(snapshot([team], 2), undefined, 0.05, options);

    let frame = live.update(snapshot([visit], 3), projection, 0.05, options);
    for (let step = 0; step < 900; step += 1) {
      const entry = frame.actors[0];
      if (
        entry?.seated &&
        entry.action !== "sit" &&
        entry.position.x === TEAM_TABLES[0]?.seats[0]?.position.x &&
        entry.position.y === TEAM_TABLES[0]?.seats[0]?.position.y
      )
        break;
      frame = live.update(snapshot([visit], 3), projection, 0.05, options);
    }
    expect(frame.actors[0]).toMatchObject({
      position: TEAM_TABLES[0]?.seats[0]?.position,
      speech: null,
    });
    for (let step = 0; step < 8; step += 1) {
      frame = live.update(snapshot([visit], 3), projection, 0.05, options);
      expect(frame.actors[0]).toMatchObject({
        position: TEAM_TABLES[0]?.seats[0]?.position,
        speech: null,
      });
      expect(frame.actors[0]?.action).not.toBe("walk");
    }
    for (let step = 0; step < 900; step += 1) {
      frame = live.update(snapshot([visit], 3), projection, 0.05, options);
      if (frame.actors[0]?.speech === "Visit update") break;
    }
    expect(frame.actors[0]).toMatchObject({
      position: destinationFor(visit).position,
      speech: "Visit update",
    });
  });

  it("follows the entry queue, staggered team releases, visits, and final forum", () => {
    let simulation = createOfficeSimulation();
    const live = new LiveOfficeScene();
    live.update(officeSimulationSnapshot(simulation), undefined, 0, options);
    const teamSeats = new Map(
      TEAM_TABLES.flatMap((table) =>
        table.seats.map((seat) => [seat.id, seat] as const),
      ),
    );
    const entryReleases = new Map<string, number>();
    const teamReleases = new Map<string, number>();
    const teamTransitions = new Set<string>();
    const teamArrivals = new Set<string>();
    const visitStarts = new Map<
      string,
      { position: { x: number; y: number }; target: { x: number; y: number } }
    >();
    const visitArrivals = new Set<string>();
    let frame = live.update(
      officeSimulationSnapshot(simulation),
      undefined,
      0,
      options,
    );
    for (let tick = 1; tick <= 1580; tick += 1) {
      simulation = stepOfficeSimulation(simulation);
      const current = officeSimulationSnapshot(simulation);
      frame = live.update(current, undefined, 0.05, options);
      for (const source of current.actors) {
        const entry = frame.actors.find(
          (candidate) => candidate.id === source.id,
        );
        if (!entry) throw new RangeError(`Missing frame actor ${source.id}`);
        const destination = destinationFor(source);
        if (destination.kind === "work" && source.id !== "chair")
          entryReleases.set(source.id, entryReleases.get(source.id) ?? tick);
        const seat = teamSeats.get(source.id);
        if (destination.kind === "team" && seat) {
          teamReleases.set(source.id, teamReleases.get(source.id) ?? tick);
          if (["stand", "walk", "sit"].includes(entry.action))
            teamTransitions.add(source.id);
        }
        if (
          seat &&
          entry.seated &&
          entry.action !== "sit" &&
          Math.hypot(
            entry.position.x - seat.position.x,
            entry.position.y - seat.position.y,
          ) < 1
        )
          teamArrivals.add(entry.id);
        if (destination.kind === "visit") {
          if (tick === 360)
            visitStarts.set(source.id, {
              position: entry.position,
              target: destination.position,
            });
          if (
            !["stand", "walk", "sit"].includes(entry.action) &&
            Math.hypot(
              entry.position.x - destination.position.x,
              entry.position.y - destination.position.y,
            ) < 1
          )
            visitArrivals.add(entry.id);
        }
      }
    }
    const completed = officeSimulationSnapshot(simulation);
    for (let tick = 0; tick < 400; tick += 1)
      frame = live.update(completed, undefined, 0.05, options);
    const expectedEntryReleases =
      DEFAULT_OFFICE_DEPARTMENT_RELEASE_ORDER.flatMap(
        (departmentId, departmentIndex) =>
          OFFICE_SCENE_MANIFEST.departments[departmentId].memberIds.map(
            (memberId, memberIndex) => [
              memberId,
              OFFICE_ENTRY_TIMELINE.firstReleaseTick +
                departmentIndex * OFFICE_ENTRY_TIMELINE.teamIntervalTicks +
                memberIndex * OFFICE_ENTRY_TIMELINE.memberStaggerTicks,
            ],
          ),
      );
    const expectedTeamReleases =
      DEFAULT_OFFICE_DEPARTMENT_RELEASE_ORDER.flatMap(
        (departmentId, departmentIndex) =>
          OFFICE_SCENE_MANIFEST.departments[departmentId].memberIds.map(
            (memberId, memberIndex) => [
              memberId,
              OFFICE_DEPARTMENT_TALK_TIMELINE.firstReleaseTick +
                departmentIndex *
                  OFFICE_DEPARTMENT_TALK_TIMELINE.releaseIntervalTicks +
                memberIndex *
                  OFFICE_DEPARTMENT_TALK_TIMELINE.memberStaggerTicks,
            ],
          ),
      );
    const teamMemberIds = [...teamSeats.keys()];
    const visitRepresentativeIds = ["market", "company", "financial", "risk"];

    expect([...entryReleases]).toEqual(expectedEntryReleases);
    expect([...teamReleases]).toEqual(expectedTeamReleases);
    expect([...teamTransitions].sort()).toEqual([...teamMemberIds].sort());
    expect([...teamArrivals].sort()).toEqual([...teamMemberIds].sort());
    expect([...visitStarts.keys()].sort()).toEqual(
      [...visitRepresentativeIds].sort(),
    );
    expect(
      [...visitStarts.values()].every(
        ({ position, target }) =>
          Math.hypot(position.x - target.x, position.y - target.y) > 1,
      ),
    ).toBe(true);
    expect([...visitArrivals].sort()).toEqual(
      [...visitRepresentativeIds].sort(),
    );
    const unfinished = frame.actors
      .filter((entry) => {
        const source = completed.actors.find(
          (candidate) => candidate.id === entry.id,
        );
        if (!source) return true;
        const destination = destinationFor(source);
        return (
          !entry.seated ||
          Math.hypot(
            entry.position.x - destination.position.x,
            entry.position.y - destination.position.y,
          ) > 1
        );
      })
      .map((entry) => ({
        id: entry.id,
        position: entry.position,
        action: entry.action,
      }));
    expect(unfinished).toEqual([]);
  });

  it("freezes visual time while paused and uses stable destination poses with reduced motion", () => {
    const source = actor("market");
    const live = new LiveOfficeScene();
    const first = live.update(snapshot([source]), undefined, 0.1, options);
    expect(
      live.update(snapshot([source]), undefined, 20, {
        ...options,
        paused: true,
      }),
    ).toBe(first);
    const anchor = OFFICE_SCENE_MANIFEST.forum.anchors.market;
    const target = {
      ...source,
      destination: anchor.cell,
      action: "walk" as const,
    };
    const reduced = live.update(snapshot([target], 2), undefined, 20, {
      ...options,
      reducedMotion: true,
    });
    expect(reduced.time).toBe(first.time);
    expect(reduced.actors[0]).toMatchObject({
      position: FORUM_PLACES.market.position,
      seated: true,
      gait: 0,
    });
    expect(reduced.actors[0]?.action).not.toBe("walk");
  });
});
