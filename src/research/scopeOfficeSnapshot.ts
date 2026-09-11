import type { PublicRun } from "./client/schemas";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";
import type { OfficeSimulationSnapshot } from "./officeSimulation";

export function shouldScopeDepartmentOffice(
  target: PublicRun["researchTarget"],
  beatId: OfficeSimulationSnapshot["beatId"],
): boolean {
  return (
    target?.kind === "department" &&
    beatId !== "representative-gathering" &&
    beatId !== "forum" &&
    beatId !== "complete"
  );
}

export function scopeOfficeSnapshot(
  snapshot: OfficeSimulationSnapshot,
  run: PublicRun,
): OfficeSimulationSnapshot {
  const target = run.researchTarget;
  if (!shouldScopeDepartmentOffice(target, snapshot.beatId)) return snapshot;
  if (target === undefined || target.kind !== "department") return snapshot;
  const selected = new Set<string>(
    OFFICE_SCENE_MANIFEST.departments[target.departmentId]?.memberIds ?? [],
  );
  const actorIds = snapshot.actors
    .filter((actor) => selected.has(actor.id))
    .map((actor) => actor.id);
  return Object.freeze({
    ...snapshot,
    actors: Object.freeze(
      snapshot.actors.filter((actor) => selected.has(actor.id)),
    ),
    occupancy: Object.freeze(
      snapshot.occupancy.filter((entry) => selected.has(entry.actorId)),
    ),
    reservations: Object.freeze(
      snapshot.reservations.filter((entry) => selected.has(entry.actorId)),
    ),
    cameraTarget:
      actorIds.length === 0
        ? { kind: "overview" as const }
        : { kind: "actors" as const, actorIds },
  });
}
