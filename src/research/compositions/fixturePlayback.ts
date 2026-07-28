import {
  OFFICE_CLOCK_CONTRACT,
  type OfficeBeatId,
  type OfficeChoreographyEvent,
  officeBeatAt,
} from "../officeChoreography";
import { officeEventCopy } from "../officePlaybackCopy";
import { OFFICE_SCENE_MANIFEST } from "../officeSceneManifest";
import type { ResearchEvent, ResearchPhase } from "../types";

const PHASE_BY_BEAT: Readonly<Record<OfficeBeatId, ResearchPhase>> = {
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
};
const chair = OFFICE_SCENE_MANIFEST.roster.find(
  (member) => member.departmentId === "chair",
);
if (!chair) throw new RangeError("Office manifest has no research chair");
const chairId = chair.id;

export function researchEventForOfficeEvent(
  event: OfficeChoreographyEvent,
): ResearchEvent {
  const copy = officeEventCopy(event.id);
  const progress =
    event.tick === 0
      ? 5
      : Math.min(
          100,
          Math.max(
            5,
            Math.round((event.tick / OFFICE_CLOCK_CONTRACT.completeTick) * 100),
          ),
        );
  return Object.freeze({
    id: event.id,
    phase: PHASE_BY_BEAT[officeBeatAt(event.tick).id],
    agent: event.participantIds[0] ?? chairId,
    summary: copy.summary,
    detail: copy.detail,
    ...(copy.source ? { source: copy.source } : {}),
    progress,
    tick: event.tick,
    kind: event.kind,
    participantIds: Object.freeze([...event.participantIds]),
  });
}
