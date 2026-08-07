import { OFFICE_CLOCK_CONTRACT } from "./officeChoreographyV7Contract";
import { OFFICE_MEETING_TIMELINE } from "./officeMeetingChoreography";
import {
  OFFICE_SCENE_MANIFEST,
  type OfficeManifestAgentId,
} from "./officeSceneManifest";

export type OfficePublicEventKind =
  | "checkpoint"
  | "complete"
  | "gathering"
  | "handoff"
  | "mandate"
  | "presentation"
  | "progress"
  | "summary"
  | "synthesis";

export type OfficeChoreographyEvent = {
  readonly id: string;
  readonly tick: number;
  readonly kind: OfficePublicEventKind;
  readonly participantIds: readonly OfficeManifestAgentId[];
};

const departments = Object.values(OFFICE_SCENE_MANIFEST.departments);
const specialists = OFFICE_SCENE_MANIFEST.roster
  .filter((member) => member.departmentId !== "chair")
  .map((member) => member.id);
const representatives = departments.map(
  (department) => department.representativeId,
);
const chair = OFFICE_SCENE_MANIFEST.roster.find(
  (member) => member.departmentId === "chair",
);
if (!chair) throw new RangeError("Office manifest has no research chair");

const event = (candidate: OfficeChoreographyEvent): OfficeChoreographyEvent =>
  Object.freeze({
    ...candidate,
    participantIds: Object.freeze([...candidate.participantIds]),
  });

export const OFFICE_PUBLIC_EVENTS: readonly OfficeChoreographyEvent[] =
  Object.freeze([
    event({
      id: "mandate",
      tick: 0,
      kind: "mandate",
      participantIds: [chair.id],
    }),
    event({
      id: "work-progress-80",
      tick: 80,
      kind: "progress",
      participantIds: specialists,
    }),
    event({
      id: "work-progress-140",
      tick: 140,
      kind: "progress",
      participantIds: specialists,
    }),
    event({
      id: "work-progress-200",
      tick: 200,
      kind: "progress",
      participantIds: specialists,
    }),
    ...departments.map((department) =>
      event({
        id: `checkpoint-${department.representativeId}`,
        tick: 320,
        kind: "checkpoint",
        participantIds: department.memberIds,
      }),
    ),
    event({
      id: "handoff-market-company",
      tick: 500,
      kind: "handoff",
      participantIds: [
        OFFICE_SCENE_MANIFEST.departments.market.representativeId,
        OFFICE_SCENE_MANIFEST.departments.company.representativeId,
      ],
    }),
    event({
      id: "handoff-financial-risk",
      tick: 500,
      kind: "handoff",
      participantIds: [
        OFFICE_SCENE_MANIFEST.departments.financial.representativeId,
        OFFICE_SCENE_MANIFEST.departments.risk.representativeId,
      ],
    }),
    event({
      id: "return-market",
      tick: 680,
      kind: "summary",
      participantIds: [
        OFFICE_SCENE_MANIFEST.departments.market.representativeId,
      ],
    }),
    event({
      id: "return-financial",
      tick: 680,
      kind: "summary",
      participantIds: [
        OFFICE_SCENE_MANIFEST.departments.financial.representativeId,
      ],
    }),
    event({
      id: "handoff-company-financial",
      tick: 860,
      kind: "handoff",
      participantIds: [
        OFFICE_SCENE_MANIFEST.departments.company.representativeId,
        OFFICE_SCENE_MANIFEST.departments.financial.representativeId,
      ],
    }),
    event({
      id: "handoff-risk-market",
      tick: 860,
      kind: "handoff",
      participantIds: [
        OFFICE_SCENE_MANIFEST.departments.risk.representativeId,
        OFFICE_SCENE_MANIFEST.departments.market.representativeId,
      ],
    }),
    ...departments.map((department) =>
      event({
        id: `ready-${department.representativeId}`,
        tick: 1055,
        kind: "summary",
        participantIds: department.memberIds,
      }),
    ),
    event({
      id: "representatives-gathering",
      tick: 1080,
      kind: "gathering",
      participantIds: [...representatives, chair.id],
    }),
    ...representatives.map((representativeId, index) =>
      event({
        id: `present-${representativeId}`,
        tick:
          OFFICE_MEETING_TIMELINE.reportsTick +
          index * OFFICE_MEETING_TIMELINE.presentationTicks,
        kind: "presentation",
        participantIds: [representativeId, chair.id],
      }),
    ),
    event({
      id: "chair-synthesis",
      tick: 1540,
      kind: "synthesis",
      participantIds: [chair.id, ...representatives],
    }),
    event({
      id: "complete",
      tick: OFFICE_CLOCK_CONTRACT.completeTick,
      kind: "complete",
      participantIds: [chair.id, ...representatives],
    }),
  ]);

export function officeEventsAt(
  tick: number,
): readonly OfficeChoreographyEvent[] {
  return OFFICE_PUBLIC_EVENTS.filter((candidate) => candidate.tick === tick);
}
