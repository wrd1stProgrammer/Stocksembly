import { OFFICE_SCENE_MANIFEST } from "../officeSceneManifest";
import type { OfficeSimulationSnapshot } from "../officeSimulation";
import {
  destinationFor,
  knownDestination,
  type LiveDestination,
} from "./destinations";
import { ROSTER, TEAM_TABLES } from "./layout";
import type { ActorFrame, ActorId } from "./types";

const TEAM_PAUSES = [8, 12, 10, 16] as const;

type Phase = "approach" | "handoff" | "table" | "compare" | "return";
export type InvestigationMoment = {
  readonly phase: Phase;
  readonly participants: readonly ActorId[];
  readonly team: string;
  readonly progress: number;
};
/** Presentation-only collaboration. All motion remains owned by LiveOfficeScene. */
export class InvestigationDirector {
  private nextAt = 12;
  private cursor = 0;
  private current:
    | {
        phase: Phase;
        ids: readonly ActorId[];
        team: string;
        since: number;
        targets: Map<ActorId, LiveDestination>;
      }
    | undefined;
  reset() {
    this.nextAt = 12;
    this.cursor = 0;
    this.current = undefined;
  }
  update(
    snapshot: OfficeSimulationSnapshot,
    time: number,
    enabled: boolean,
    ready: (id: ActorId, target: LiveDestination) => boolean,
  ): ReadonlyMap<ActorId, LiveDestination> {
    if (!enabled) {
      this.current = undefined;
      this.nextAt = time + 12;
      return new Map();
    }
    if (!this.current && time >= this.nextAt) {
      const available = TEAM_TABLES.filter(
        (table) =>
          table.seats.length >= 2 &&
          table.seats
            .slice(0, 2)
            .every((seat) =>
              snapshot.actors.some(
                (a) => a.id === seat.id && destinationFor(a).kind === "work",
              ),
            ),
      );
      const table = available[this.cursor % Math.max(1, available.length)];
      if (table) {
        const ids = table.seats.slice(0, 2).map((s) => s.id);
        const members = ids.map((id) => ROSTER.find((a) => a.id === id)!);
        const x = (members[0]!.seat.x + members[1]!.seat.x) / 2;
        const y = Math.min(...members.map((a) => a.seat.y)) - 65;
        const targets = new Map(
          ids.map((id, i) => {
            const position = { x: x + (i === 0 ? -21 : 21), y };
            return [
              id,
              {
                key: `investigation:${table.id}:handoff:${id}`,
                kind: "visit" as const,
                group: `investigation:${table.id}`,
                position,
                approach: position,
                facing: i === 0 ? ("right" as const) : ("left" as const),
                seated: false,
              },
            ];
          }),
        );
        this.current = {
          phase: "approach",
          ids,
          team: table.id,
          since: time,
          targets,
        };
        this.cursor++;
      } else this.nextAt = time + 12;
    }
    const c = this.current;
    if (!c) return new Map();
    if (time - c.since > 22) {
      this.current = undefined;
      this.nextAt =
        time + (TEAM_PAUSES[(this.cursor - 1) % TEAM_PAUSES.length] ?? 12);
      return new Map();
    }
    const settled = c.ids.every((id) => {
      const target = c.targets.get(id);
      return !!target && ready(id, target);
    });
    if (c.phase === "approach" && settled) {
      c.phase = "handoff";
      c.since = time;
    } else if (c.phase === "handoff" && time - c.since >= 4) {
      c.phase = "table";
      c.since = time;
      c.targets = new Map(
        c.ids.flatMap((id) => {
          const member = OFFICE_SCENE_MANIFEST.roster.find((a) => a.id === id);
          const target =
            member && knownDestination(id, member.meetingSeat.cell);
          return target
            ? [
                [
                  id,
                  {
                    ...target,
                    key: `investigation:${c.team}:table:${id}`,
                    kind: "visit" as const,
                  },
                ],
              ]
            : [];
        }),
      );
    } else if (c.phase === "table" && settled) {
      c.phase = "compare";
      c.since = time;
    } else if (c.phase === "compare" && time - c.since >= 8) {
      c.phase = "return";
      c.since = time;
      c.targets = new Map(
        c.ids.flatMap((id) => {
          const actor = snapshot.actors.find((a) => a.id === id);
          return actor ? [[id, destinationFor(actor)]] : [];
        }),
      );
    } else if (c.phase === "return" && settled) {
      this.current = undefined;
      this.nextAt =
        time + (TEAM_PAUSES[(this.cursor - 1) % TEAM_PAUSES.length] ?? 12);
      return new Map();
    }
    return c.targets;
  }
  moment(time: number): InvestigationMoment | undefined {
    const c = this.current;
    return c
      ? {
          phase: c.phase,
          participants: c.ids,
          team: c.team,
          progress: Math.min(
            1,
            (time - c.since) / (c.phase === "handoff" ? 4 : 8),
          ),
        }
      : undefined;
  }
}
export function investigationPose(
  actor: ActorFrame,
  moment: InvestigationMoment | undefined,
): ActorFrame {
  if (
    !moment?.participants.includes(actor.id) ||
    actor.action === "walk" ||
    actor.action === "stand" ||
    actor.action === "sit"
  )
    return actor;
  if (moment.phase === "handoff")
    return { ...actor, evidence: false, action: "listen", emphasis: 0.7 };
  if (moment.phase === "compare")
    return {
      ...actor,
      evidence: true,
      action: moment.progress % 0.4 < 0.2 ? "read" : "write",
      emphasis: 0.8,
    };
  return actor;
}
