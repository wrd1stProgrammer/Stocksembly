import type { OfficeDialogue } from "../officeDialogue";
import type {
  OfficeRenderActor,
  OfficeRenderSnapshot,
} from "../officeRenderer";
import { OFFICE_SCENE_MANIFEST } from "../officeSceneManifest";
import type {
  OfficeActorSnapshot,
  OfficeSimulationSnapshot,
} from "../officeSimulation";
import {
  destinationFor,
  dialogueDestinations,
  knownDestination,
  type LiveDestination,
  sameCell,
} from "./destinations";
import {
  FOOT_RADIUS,
  findMotionRoute,
  isFloorPoint,
  nearestFloorPoint,
} from "./navigation";
import type {
  Action,
  ActorFrame,
  ActorId,
  Facing,
  Point,
  SceneFrame,
} from "./types";

export type LiveSceneOptions = {
  readonly reducedMotion: boolean;
  readonly paused: boolean;
  readonly dialogue?: OfficeDialogue;
  readonly speech?: {
    readonly speakerId: ActorId;
    readonly message: string;
  } | null;
};
type ActorState = {
  position: Point;
  facing: Facing;
  destination: LiveDestination;
  pendingDestination: LiveDestination | null;
  anchor: LiveDestination | null;
  route: readonly Point[];
  routeIndex: number;
  phase: "ready" | "standing" | "walking" | "sitting";
  progress: number;
  gait: number;
  waited: number;
  settledAt: number;
};
const TRANSITION_SECONDS = 0.65;
const WALK_SPEED = 156;
const COMMITTED_TEAM_HOLD_SECONDS = 0.5;

function distance(left: Point, right: Point): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}
function facingToward(from: Point, to: Point): Facing {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.abs(dx) > Math.abs(dy)
    ? dx < 0
      ? "left"
      : "right"
    : dy < 0
      ? "up"
      : "down";
}
function mix(from: Point, to: Point, progress: number): Point {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}
function stationaryAction(
  source: OfficeActorSnapshot,
  target: LiveDestination,
  time: number,
  index: number,
  speaking: boolean,
): { readonly action: Action; readonly progress: number } {
  const progress = ((time + index * 0.71) % 3.5) / 3.5;
  if (speaking)
    return { action: source.id === "risk" ? "challenge" : "present", progress };
  if (source.action === "chair-synthesis" || source.action === "summarize")
    return { action: speaking ? "present" : "write", progress };
  if (target.kind === "work" && source.action === "seated-work") {
    const duration = 9.3 + (index % 4) * 0.71;
    const local = (time + index * 1.79) % duration;
    const typingEnd = duration * 0.45;
    const readEnd = duration * 0.72;
    const writeEnd = duration * 0.9;
    if (local < typingEnd)
      return { action: "typing", progress: local / typingEnd };
    if (local < readEnd)
      return {
        action: "read",
        progress: (local - typingEnd) / (readEnd - typingEnd),
      };
    if (local < writeEnd)
      return {
        action: "write",
        progress: (local - readEnd) / (writeEnd - readEnd),
      };
    return {
      action: "discover",
      progress: (local - writeEnd) / (duration - writeEnd),
    };
  }
  if (target.kind === "team" || target.kind === "forum") {
    const local = (time + index * 1.37) % 8.4;
    if (local < 4.1) return { action: "read", progress: local / 4.1 };
    if (local < 6.8) return { action: "write", progress: (local - 4.1) / 2.7 };
    return { action: "listen", progress: (local - 6.8) / 1.6 };
  }
  return { action: target.seated ? "read" : "idle", progress };
}

function initialState(
  source: OfficeActorSnapshot,
  target: LiveDestination,
  reducedMotion: boolean,
): ActorState {
  const origin =
    reducedMotion ||
    (sameCell(source.cell, source.destination) && source.motion === null)
      ? target
      : knownDestination(source.id, source.cell);
  const position = origin?.position ?? nearestFloorPoint(source.world);
  return {
    position,
    facing: origin?.facing ?? source.facing,
    destination: origin ?? {
      ...target,
      key: `initial:${source.id}`,
      position,
      approach: position,
      seated: false,
      kind: "floor",
    },
    pendingDestination: null,
    anchor: origin?.seated ? origin : null,
    route: [],
    routeIndex: 0,
    phase: "ready",
    progress: 1,
    gait: 0,
    waited: 0,
    settledAt: 0,
  };
}

export class LiveOfficeScene {
  private states = new Map<ActorId, ActorState>();
  private time = 0;
  private lastTick = -1;
  private lastFrame: SceneFrame | undefined;
  private forumActive = false;
  private readonly seatedTeams = new Set<string>();
  private targets: ReadonlyMap<ActorId, LiveDestination> = new Map();

  readyForDialogue(dialogue: OfficeDialogue): boolean {
    return dialogue.participantIds.every((id) => {
      const state = this.states.get(id);
      const target = this.targets.get(id);
      // Department-only views can omit the chair and other departments.
      if (!state) return true;
      return (
        state.phase === "ready" &&
        target?.key === state.destination.key &&
        distance(state.position, target.position) < 1 &&
        state.facing === target.facing
      );
    });
  }

  reset(): void {
    this.states.clear();
    this.seatedTeams.clear();
    this.forumActive = false;
    this.targets = new Map();
    this.time = 0;
    this.lastTick = -1;
    this.lastFrame = undefined;
  }

  update(
    snapshot: OfficeSimulationSnapshot,
    projection: OfficeRenderSnapshot | undefined,
    deltaSeconds: number,
    options: LiveSceneOptions,
  ): SceneFrame {
    if (snapshot.tick < this.lastTick) this.reset();
    if (options.paused && this.lastFrame) return this.lastFrame;
    this.lastTick = snapshot.tick;
    const delta =
      options.paused || options.reducedMotion
        ? 0
        : Math.max(
            0,
            Math.min(Number.isFinite(deltaSeconds) ? deltaSeconds : 0, 0.1),
          );
    this.time += delta;
    const included = new Set(snapshot.actors.map((actor) => actor.id));
    for (const id of this.states.keys())
      if (!included.has(id)) this.states.delete(id);
    if (options.dialogue?.kind === "team") {
      const speaker = OFFICE_SCENE_MANIFEST.roster.find(
        (actor) => actor.id === options.dialogue?.speakerId,
      );
      if (speaker) this.seatedTeams.add(speaker.departmentId);
    }
    if (options.dialogue?.kind === "forum") this.forumActive = true;
    const encounter =
      options.dialogue && this.forumActive && options.dialogue.kind === "work"
        ? { ...options.dialogue, kind: "forum" as const }
        : options.dialogue;
    const targets = new Map(
      encounter ? dialogueDestinations(encounter, this.seatedTeams) : [],
    );
    if (snapshot.tick < 120) {
      for (const actor of snapshot.actors) {
        if (destinationFor(actor).kind === "floor") targets.delete(actor.id);
      }
    }
    this.targets = targets;
    const projected = new Map(
      projection?.actors.map((actor) => [actor.id, actor]) ?? [],
    );
    for (const actor of snapshot.actors) {
      const target = this.targets.get(actor.id) ?? destinationFor(actor);
      let state = this.states.get(actor.id);
      if (!state) {
        state = initialState(actor, target, options.reducedMotion);
        this.states.set(actor.id, state);
      }
      if (options.reducedMotion) {
        state.position = target.position;
        state.facing = target.facing;
        state.destination = target;
        state.pendingDestination = null;
        state.anchor = target.seated ? target : null;
        state.phase = "ready";
        state.progress = 1;
        state.route = [];
        state.gait = 0;
        continue;
      }
      if (state.destination.key === target.key) {
        state.pendingDestination = null;
      } else if (
        state.destination.kind === "team" &&
        (state.phase !== "ready" ||
          this.time - state.settledAt < COMMITTED_TEAM_HOLD_SECONDS)
      ) {
        state.pendingDestination = target;
      } else {
        state.pendingDestination = null;
        this.setDestination(state, target);
      }
    }
    for (const actor of snapshot.actors) {
      const state = this.states.get(actor.id);
      if (state && delta > 0) this.advance(actor.id, state, delta);
    }
    const actors = snapshot.actors.map((source, index) => {
      const state = this.states.get(source.id);
      if (!state)
        throw new RangeError(`Missing visible office actor ${source.id}`);
      return this.frameFor(
        source,
        projected.get(source.id),
        state,
        index,
        options.reducedMotion,
        options.speech,
      );
    });
    const speakers = actors.filter((actor) => actor.speech !== null);
    const turned = actors.map((actor) => {
      const state = this.states.get(actor.id);
      if (state?.phase !== "ready" || actor.speech !== null) return actor;
      const speaker = speakers.find(
        (candidate) =>
          candidate.id !== actor.id &&
          this.states.get(candidate.id)?.destination.group ===
            state.destination.group,
      );
      return speaker
        ? {
            ...actor,
            headFacing: facingToward(actor.position, speaker.position),
          }
        : actor;
    });
    this.lastFrame = {
      time: this.time,
      actors: turned,
      speaker: speakers[0]?.id ?? null,
    };
    return this.lastFrame;
  }

  private setDestination(state: ActorState, target: LiveDestination): void {
    const exiting = state.anchor !== null && !isFloorPoint(state.position);
    const start =
      exiting && state.anchor ? state.anchor.approach : state.position;
    const route = findMotionRoute(start, target.approach);
    state.route =
      route.length > 0 ? (exiting ? [state.position, ...route] : route) : [];
    state.routeIndex = 1;
    const standing =
      state.phase === "standing" ||
      state.phase === "sitting" ||
      (state.phase === "ready" && state.anchor !== null);
    const progress =
      state.phase === "standing"
        ? state.progress
        : state.phase === "sitting"
          ? 1 - state.progress
          : 0;
    state.phase = standing ? "standing" : "walking";
    state.progress = progress;
    state.waited = 0;
    state.destination = target;
  }

  private advance(id: ActorId, state: ActorState, delta: number): void {
    if (state.phase === "ready") {
      const pending = state.pendingDestination;
      if (
        pending &&
        this.time - state.settledAt >= COMMITTED_TEAM_HOLD_SECONDS
      ) {
        state.pendingDestination = null;
        this.setDestination(state, pending);
      }
      return;
    }
    if (state.phase === "standing") {
      state.progress = Math.min(1, state.progress + delta / TRANSITION_SECONDS);
      if (state.progress === 1) {
        state.phase = "walking";
        state.progress = 0;
      }
      return;
    }
    if (state.phase === "sitting") {
      state.progress = Math.min(1, state.progress + delta / TRANSITION_SECONDS);
      state.position = mix(
        state.destination.approach,
        state.destination.position,
        state.progress,
      );
      if (state.progress === 1) {
        state.phase = "ready";
        state.anchor = state.destination;
        state.settledAt = this.time;
      }
      return;
    }
    let remaining = delta * WALK_SPEED;
    while (remaining > 0) {
      const next = state.route[state.routeIndex];
      if (!next) {
        if (distance(state.position, state.destination.approach) > 1) {
          state.waited += delta;
          if (state.waited >= 0.75) {
            const exiting =
              state.anchor !== null && !isFloorPoint(state.position);
            const start =
              exiting && state.anchor ? state.anchor.approach : state.position;
            const route = findMotionRoute(start, state.destination.approach);
            state.route =
              route.length > 0 && exiting ? [state.position, ...route] : route;
            state.routeIndex = 1;
            state.waited = 0;
          }
          return;
        }
        state.facing = state.destination.facing;
        state.progress = 0;
        state.phase = state.destination.seated ? "sitting" : "ready";
        state.anchor = state.destination.seated ? state.destination : null;
        state.settledAt = this.time;
        return;
      }
      const length = distance(state.position, next);
      if (length < 0.01) {
        state.routeIndex += 1;
        continue;
      }
      const travel = Math.min(length, remaining);
      const position = mix(state.position, next, travel / length);
      const people = [...this.states]
        .filter(([otherId]) => otherId !== id)
        .map(([, other]) => other.position);
      const blocked = people.some(
        (other) =>
          distance(position, other) < FOOT_RADIUS * 2 &&
          distance(position, other) < distance(state.position, other),
      );
      if (blocked) {
        state.waited += delta;
        // Replan only when actually blocked, never on every rendered snapshot.
        if (state.waited >= 0.75) {
          const route = findMotionRoute(
            state.position,
            state.destination.approach,
            people,
          );
          if (route.length > 0) {
            state.route = route;
            state.routeIndex = 1;
          }
          state.waited = 0;
        }
        return;
      }
      state.waited = 0;
      state.facing = facingToward(state.position, next);
      state.position = position;
      if (state.anchor && isFloorPoint(position)) state.anchor = null;
      state.gait += (travel / 52) * Math.PI * 2;
      remaining -= travel;
      if (travel === length) state.routeIndex += 1;
    }
  }

  private frameFor(
    source: OfficeActorSnapshot,
    projected: OfficeRenderActor | undefined,
    state: ActorState,
    index: number,
    reducedMotion: boolean,
    liveSpeech: LiveSceneOptions["speech"],
  ): ActorFrame {
    const ready = state.phase === "ready";
    const settled =
      liveSpeech !== undefined ||
      reducedMotion ||
      this.time - state.settledAt >= 0.15;
    const speech =
      ready &&
      settled &&
      state.destination.key ===
        (this.targets.get(source.id) ?? destinationFor(source)).key &&
      (liveSpeech === undefined
        ? projected?.bubble.visible
        : liveSpeech?.speakerId === source.id)
        ? (liveSpeech?.message ?? projected?.bubble.message ?? null)
        : null;
    const stationary = stationaryAction(
      source,
      state.destination,
      this.time,
      index,
      speech !== null,
    );
    const action: Action =
      state.phase === "standing"
        ? "stand"
        : state.phase === "walking"
          ? "walk"
          : state.phase === "sitting"
            ? "sit"
            : stationary.action;
    return {
      id: source.id,
      position: state.position,
      facing: state.facing,
      headFacing: state.facing,
      action,
      progress: ready ? stationary.progress : state.progress,
      gait: reducedMotion ? 0 : state.gait,
      seated: state.phase === "sitting" || (ready && state.destination.seated),
      evidence:
        !ready ||
        state.destination.kind !== "work" ||
        stationary.action === "read" ||
        stationary.action === "discover",
      emphasis: reducedMotion
        ? 0
        : speech === null
          ? 0.12
          : 0.65 * Math.max(0, Math.sin(stationary.progress * Math.PI)),
      speech,
    };
  }
}
