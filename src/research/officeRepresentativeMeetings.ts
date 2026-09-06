import type { AgentId, ResearchEvent } from "./types";

const representatives = new Set<AgentId>([
  "market",
  "company",
  "financial",
  "risk",
]);
const discussionKinds = new Set([
  "challenge_committed",
  "followup_committed",
  "owner_response_committed",
]);

// Keep one visit per representative. Other persisted arguments are spoken at
// the central table; holding them briefly keeps streamed visits in one round.
export function officeRepresentativeMeetings(
  events: readonly ResearchEvent[],
): readonly ResearchEvent[] {
  const start = events.findIndex((event) =>
    discussionKinds.has(event.workflowKind ?? ""),
  );
  if (start < 0) return events;
  const paired = new Set<AgentId>();
  const visits: ResearchEvent[] = [];
  const central: ResearchEvent[] = [];
  let closed = false;
  for (const event of events.slice(start)) {
    const parties = [
      ...new Set([event.agent, ...(event.participantIds ?? [])]),
    ];
    const challenge = event.workflowKind === "challenge_committed";
    if (!challenge) closed = true;
    const canVisit =
      !closed &&
      parties.length === 2 &&
      parties.every((id) => representatives.has(id) && !paired.has(id));
    if (canVisit) {
      visits.push({
        ...event,
        officeMeeting: {
          location: "visit",
          seatedRepresentativeIds: ["chair", ...paired],
        },
      });
      for (const id of parties) paired.add(id);
    } else {
      central.push({
        ...event,
        officeMeeting: {
          location: "forum",
          seatedRepresentativeIds: ["chair", ...representatives],
        },
      });
    }
  }
  const visible = [
    ...events.slice(0, start),
    ...visits,
    ...(closed || paired.size === representatives.size ? central : []),
  ];
  let tick = 0;
  return visible.map((event) => {
    tick = Math.max(
      tick,
      event.tick ?? 0,
      event.officeMeeting?.location === "forum" ? 1301 : 0,
    );
    return { ...event, tick };
  });
}
