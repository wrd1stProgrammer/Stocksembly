import { expect, it } from "vitest";
import { OFFICE_SCENE_MANIFEST } from "../officeSceneManifest";
import {
  createOfficeSimulation,
  officeSimulationSnapshot,
} from "../officeSimulation";
import { LiveOfficeScene } from "./liveScene";

const initial = officeSimulationSnapshot(createOfficeSimulation());
const work = {
  ...initial,
  tick: 180,
  actors: initial.actors.map((a) => {
    const m = OFFICE_SCENE_MANIFEST.roster.find((m) => m.id === a.id)!;
    return {
      ...a,
      cell: m.workSeat.cell,
      destination: m.workSeat.cell,
      motion: null,
    };
  }),
};
const options = {
  reducedMotion: false,
  paused: false,
  investigating: true,
  snapToProgress: true,
};
it("completes collaboration for all four teams and walks continuously when interrupted", () => {
  const scene = new LiveOfficeScene(),
    seen = new Set<string>();
  const starts: string[] = [];
  let lastTeam: string | undefined;
  let endedAt = 0;
  let frame = scene.update(work, undefined, 0, options);
  for (let i = 0; i < 7000; i++) {
    frame = scene.update(work, undefined, 0.05, options);
    if (frame.investigation && !lastTeam) {
      starts.push(frame.investigation.team);
      if (endedAt) expect(frame.time - endedAt).toBeGreaterThanOrEqual(7.9);
    }
    if (!frame.investigation && lastTeam) endedAt = frame.time;
    lastTeam = frame.investigation?.team;
    if (frame.investigation)
      seen.add(`${frame.investigation.team}:${frame.investigation.phase}`);
  }
  expect(starts.slice(0, 4)).toEqual([
    "market",
    "company",
    "financial",
    "risk",
  ]);
  for (const team of ["market", "company", "financial", "risk"])
    for (const phase of ["handoff", "compare", "return"])
      expect(seen.has(`${team}:${phase}`), `${team}:${phase}`).toBe(true);
  while (!frame.investigation)
    frame = scene.update(work, undefined, 0.05, options);
  for (let i = 0; i < 20; i++)
    frame = scene.update(work, undefined, 0.05, options);
  const before = frame;
  frame = scene.update(work, undefined, 0.05, {
    ...options,
    investigating: false,
  });
  expect(frame.investigation).toBeUndefined();
  for (const actor of frame.actors) {
    const previous = before.actors.find((a) => a.id === actor.id)!;
    expect(
      Math.hypot(
        actor.position.x - previous.position.x,
        actor.position.y - previous.position.y,
      ),
    ).toBeLessThan(12);
  }
});
it("does not schedule optional movement with reduced motion or when disabled", () => {
  for (const override of [{ reducedMotion: true }, { investigating: false }]) {
    const scene = new LiveOfficeScene();
    for (let i = 0; i < 1000; i++)
      expect(
        scene.update(work, undefined, 0.05, { ...options, ...override })
          .investigation,
      ).toBeUndefined();
  }
});
