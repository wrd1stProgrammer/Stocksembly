import type { OfficeManifestAgentId } from "./officeSceneManifest";

export type OfficeMeetingPhase =
  | "assembling"
  | "chair-synthesis"
  | "challenge-round"
  | "complete"
  | "department-reports"
  | "inactive"
  | "opening"
  | "settling";

export const OFFICE_MEETING_TIMELINE = Object.freeze({
  assembleTick: 1080,
  settleTick: 1200,
  openingTick: 1260,
  reportsTick: 1300,
  challengeTick: 1520,
  synthesisTick: 1540,
  completeTick: 1580,
  presentationTicks: 55,
});

export const OFFICE_MEETING_RELEASE_TICKS: Readonly<
  Partial<Record<OfficeManifestAgentId, number>>
> = Object.freeze({
  chair: 1080,
  market: 1080,
  company: 1110,
  financial: 1140,
  risk: 1170,
});

export function officeMeetingPhaseAt(tick: number): OfficeMeetingPhase {
  if (tick < OFFICE_MEETING_TIMELINE.assembleTick) return "inactive";
  if (tick < OFFICE_MEETING_TIMELINE.settleTick) return "assembling";
  if (tick < OFFICE_MEETING_TIMELINE.openingTick) return "settling";
  if (tick < OFFICE_MEETING_TIMELINE.reportsTick) return "opening";
  if (tick < OFFICE_MEETING_TIMELINE.challengeTick) return "department-reports";
  if (tick < OFFICE_MEETING_TIMELINE.synthesisTick) return "challenge-round";
  if (tick < OFFICE_MEETING_TIMELINE.completeTick) return "chair-synthesis";
  return "complete";
}
