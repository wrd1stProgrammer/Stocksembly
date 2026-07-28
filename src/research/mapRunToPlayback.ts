import type {
  CompositionOrigin,
  ResearchEventWithMode,
  ResearchMode,
} from "./compositionMode";
import type { PublicResearchEvent } from "./domain/publicEvent";
import { OFFICE_PUBLIC_EVENTS, officeBeatAt } from "./officeChoreography";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";
import type { AgentId, ResearchPhase } from "./types";

const phaseFor = (tick: number): ResearchPhase => {
  const beat = officeBeatAt(tick).id;
  return (
    {
      briefing: "briefing",
      "parallel-work": "collecting",
      "department-talk": "analyzing",
      "visit-wave-a": "challenging",
      "return-a": "challenging",
      "visit-wave-b": "challenging",
      "return-b": "auditing",
      "representative-gathering": "gathering",
      forum: "committee",
      complete: "complete",
    } as const
  )[beat];
};

const chair =
  OFFICE_SCENE_MANIFEST.roster.find((m) => m.departmentId === "chair")?.id ??
  "chair";

const manifestAgentId = (id: string): AgentId | undefined =>
  OFFICE_SCENE_MANIFEST.roster.find((member) => member.id === id)?.id;

export function mapRunToPlayback(
  events: readonly PublicResearchEvent[],
  mode: Exclude<ResearchMode, "calibration"> = "official",
  origin: CompositionOrigin = {
    kind: "research-composition-origin",
    mode,
    id: `stocksembly:${mode}`,
  },
): readonly ResearchEventWithMode[] {
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
  const used = new Set<string>();
  const out: ResearchEventWithMode[] = [];
  for (const event of sorted) {
    const isMemo =
      event.stage === "memo" &&
      (event.kind === "artifact_committed" || event.kind === "state_committed");
    const isChair =
      event.artifact.logicalArtifactId === "chair_synthesis:chair" ||
      event.stage === "chair_synthesis";
    const isReport = event.kind === "report_published";
    if (!isMemo && !isChair && !isReport) continue;
    const candidate = isReport
      ? OFFICE_PUBLIC_EVENTS.find((x) => x.kind === "complete")
      : isChair
        ? OFFICE_PUBLIC_EVENTS.find((x) => x.kind === "synthesis")
        : OFFICE_PUBLIC_EVENTS.find(
            (x) => x.kind === "progress" && !used.has(x.id),
          );
    if (!candidate) continue;
    used.add(candidate.id);
    const agent = manifestAgentId(event.actorId) ?? chair;
    out.push(
      Object.freeze({
        id: event.eventId,
        phase: phaseFor(candidate.tick),
        agent,
        summary: event.summary,
        detail: event.detail,
        progress:
          candidate.tick === 0
            ? 5
            : Math.min(100, Math.max(5, Math.round(candidate.tick / 16.2))),
        tick: candidate.tick,
        kind: candidate.kind,
        participantIds: Object.freeze(
          event.participantIds?.flatMap((id) => {
            const participantId = manifestAgentId(id);
            return participantId === undefined ? [] : [participantId];
          }) ?? [agent],
        ),
        mode,
        origin,
      }),
    );
  }
  return Object.freeze(out);
}
