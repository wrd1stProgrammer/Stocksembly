import type { Locale } from "../lib/i18n";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";
import { speechBubbleSegments } from "./researchPresentation";
import type { AgentId, ResearchEvent } from "./types";

export type OfficeDialogue = {
  readonly id: string;
  readonly speakerId: AgentId;
  readonly participantIds: readonly AgentId[];
  readonly kind: "work" | "team" | "visit" | "forum";
  readonly segments: readonly string[];
};
export type OfficeDialogueChange = {
  readonly id: string;
  readonly status: "started" | "finished";
};
export type OfficePresentation = {
  readonly event: ResearchEvent | undefined;
  readonly active: boolean;
  readonly onChange: (change: OfficeDialogueChange) => void;
};

export function officeDialogue(
  event: ResearchEvent,
  locale: Locale,
): OfficeDialogue {
  const workflow = event.workflowKind;
  const member = OFFICE_SCENE_MANIFEST.roster.find(
    (actor) => actor.id === event.agent,
  );
  const parties = [...new Set([event.agent, ...(event.participantIds ?? [])])];
  const kind =
    workflow === "department_consolidation_committed" ||
    (["summary", "checkpoint"].includes(event.kind ?? "") &&
      event.phase === "analyzing")
      ? "team"
      : workflow === "department_ballot_committed" ||
          ["gathering", "committee", "complete"].includes(event.phase)
        ? "forum"
        : parties.length > 1 &&
            ([
              "challenge_committed",
              "followup_committed",
              "owner_response_committed",
            ].includes(workflow ?? "") ||
              event.phase === "challenging")
          ? "visit"
          : "work";
  const participantIds =
    kind === "forum"
      ? OFFICE_SCENE_MANIFEST.roster
          .filter((actor) => actor.finalLocation === "forum")
          .map((actor) => actor.id)
      : kind === "team"
        ? OFFICE_SCENE_MANIFEST.roster
            .filter((actor) => actor.departmentId === member?.departmentId)
            .map((actor) => actor.id)
        : kind === "visit"
          ? parties
          : [event.agent];
  return {
    id: event.id,
    speakerId: event.agent,
    participantIds,
    kind,
    segments: speechBubbleSegments(event.summary[locale], locale),
  };
}

// Arrival and speech share the renderer's clock. Re-rendering the same event
// cannot restart it, and the last segment has the same finite lifetime as the rest.
export class OfficeDialoguePlayer {
  private id: string | undefined;
  private index = 0;
  private elapsed = 0;
  private started = false;
  private readonly finished = new Set<string>();
  private readonly spoken = new Set<string>();

  isFinished(id: string): boolean {
    return this.finished.has(id);
  }

  update(
    dialogue: OfficeDialogue | undefined,
    ready: boolean,
    deltaMs: number,
  ) {
    const changes: OfficeDialogueChange[] = [];
    if (!dialogue || this.finished.has(dialogue.id))
      return { message: null, elapsed: 0, changes };
    if (this.id !== dialogue.id) {
      this.id = dialogue.id;
      this.index = 0;
      this.elapsed = 0;
      this.started = false;
    }
    if (!ready) return { message: null, elapsed: 0, changes };
    const fingerprint = `${dialogue.speakerId}:${dialogue.segments.join(" ")}`;
    if (!this.started) {
      this.started = true;
      changes.push({ id: dialogue.id, status: "started" });
      if (this.spoken.has(fingerprint)) this.index = dialogue.segments.length;
      this.spoken.add(fingerprint);
    } else this.elapsed += Math.max(0, deltaMs);
    const segment = dialogue.segments[this.index];
    if (
      segment !== undefined &&
      this.elapsed >= Math.max(2_200, [...segment].length * 32 + 900)
    ) {
      this.index += 1;
      this.elapsed = 0;
    }
    const message = dialogue.segments[this.index] ?? null;
    if (message === null) {
      this.finished.add(dialogue.id);
      changes.push({ id: dialogue.id, status: "finished" });
    }
    return { message, elapsed: this.elapsed, changes };
  }
}
