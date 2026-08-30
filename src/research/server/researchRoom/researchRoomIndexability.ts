export const RESEARCH_ROOM_INDEXING_DELAY_MS = 7 * 24 * 60 * 60 * 1_000;

export type ResearchRoomReportVersionStatus =
  | "complete"
  | "complete_with_limitations"
  | "incomplete";

export function isResearchRoomPublicationMature(
  publishedAt: string,
  now: Date,
): boolean {
  const age = now.getTime() - new Date(publishedAt).getTime();
  return Number.isFinite(age) && age >= RESEARCH_ROOM_INDEXING_DELAY_MS;
}

export function requiresResearchRoomViewCredit(
  publishedAt: string,
  now: Date,
): boolean {
  return !isResearchRoomPublicationMature(publishedAt, now);
}

export function isResearchRoomIndexable(
  status: ResearchRoomReportVersionStatus,
  publishedAt: string,
  now: Date,
): boolean {
  return (
    (status === "complete" || status === "complete_with_limitations") &&
    isResearchRoomPublicationMature(publishedAt, now)
  );
}
