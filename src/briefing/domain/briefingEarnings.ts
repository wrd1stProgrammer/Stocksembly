import type {
  BriefingEditionPayload,
  BriefingUpcomingEvent,
} from "./contracts";

type EditionWithEarnings = Pick<
  BriefingEditionPayload,
  "earnings" | "upcomingEvents"
>;

function isEarningsEvent(event: BriefingUpcomingEvent): boolean {
  return /earnings|results|실적/iu.test(event.name);
}

export function selectNextEarnings(
  edition: EditionWithEarnings,
): BriefingUpcomingEvent | undefined {
  const earningsEvents = edition.upcomingEvents.filter(isEarningsEvent);
  const confirmed = earningsEvents.find(
    (event) => event.certainty === "confirmed",
  );
  if (confirmed !== undefined) return confirmed;
  if (edition.earnings?.nextReportAt !== undefined)
    return {
      name: "Earnings",
      scheduledAt: edition.earnings.nextReportAt,
      whyItMatters: "Next scheduled earnings release",
      certainty: edition.earnings.nextReportCertainty ?? "estimated",
    };
  return earningsEvents[0];
}
