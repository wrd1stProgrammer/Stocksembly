import {
  assertNeverOffice,
  DEFAULT_OFFICE_DEPARTMENT_RELEASE_ORDER,
  OFFICE_DEPARTMENT_TALK_TIMELINE,
  OFFICE_ENTRY_TIMELINE,
  type OfficeActorDirective,
  type OfficeCameraTarget,
  officeBeatAt,
} from "./officeChoreographyV7Contract";
import { facingToward } from "./officeFacingV7";
import {
  buildForumDirectives,
  forumAnchorFor,
} from "./officeForumChoreographyV7";
import {
  OFFICE_MEETING_RELEASE_TICKS,
  officeMeetingPhaseAt,
} from "./officeMeetingChoreography";
import {
  OFFICE_SCENE_MANIFEST,
  type OfficeDepartmentId,
  type OfficeManifestAgentId,
} from "./officeSceneManifest";

type VisitPair = {
  readonly visitorDepartment: OfficeDepartmentId;
  readonly hostDepartment: OfficeDepartmentId;
};

const VISIT_WAVE_A: readonly VisitPair[] = [
  { visitorDepartment: "market", hostDepartment: "company" },
  { visitorDepartment: "financial", hostDepartment: "risk" },
];
const VISIT_WAVE_B: readonly VisitPair[] = [
  { visitorDepartment: "company", hostDepartment: "financial" },
  { visitorDepartment: "risk", hostDepartment: "market" },
];
function chairMember() {
  const member = OFFICE_SCENE_MANIFEST.roster.find(
    (candidate) => candidate.departmentId === "chair",
  );
  if (!member) throw new RangeError("Office manifest has no research chair");
  return member;
}
const chair = chairMember();

export function officeEntryCellFor(actorId: OfficeManifestAgentId): {
  readonly x: number;
  readonly y: number;
} {
  if (actorId === "chair") return chair.workSeat.cell;
  const entryOrder = DEFAULT_OFFICE_DEPARTMENT_RELEASE_ORDER.flatMap(
    (departmentId) => OFFICE_SCENE_MANIFEST.departments[departmentId].memberIds,
  );
  const specialistIndex = entryOrder.indexOf(actorId);
  if (specialistIndex < 0)
    throw new RangeError(`Missing office entry position for ${actorId}`);
  return Object.freeze({ x: 21, y: 23 + specialistIndex });
}

function entryDirectives(tick: number): readonly OfficeActorDirective[] {
  const directives = new Map<OfficeManifestAgentId, OfficeActorDirective>();
  directives.set(chair.id, {
    ...seatDirective(chair, tick < 40 ? "entry-chair-briefing" : "entry-chair"),
    terminalAction: tick < 40 ? "talk" : "idle",
  });
  // The arrival line is a fixed product narrative: market, company,
  // financial, then risk.  Later department discussions may still follow
  // the order in which durable results arrive, but that must never reshuffle
  // people who are visibly walking into the office.
  for (const [
    departmentIndex,
    departmentId,
  ] of DEFAULT_OFFICE_DEPARTMENT_RELEASE_ORDER.entries()) {
    const department = OFFICE_SCENE_MANIFEST.departments[departmentId];
    for (const [memberIndex, memberId] of department.memberIds.entries()) {
      const member = OFFICE_SCENE_MANIFEST.roster.find(
        (candidate) => candidate.id === memberId,
      );
      if (!member) throw new RangeError(`Missing entry member ${memberId}`);
      const releaseTick =
        OFFICE_ENTRY_TIMELINE.firstReleaseTick +
        departmentIndex * OFFICE_ENTRY_TIMELINE.teamIntervalTicks +
        memberIndex * OFFICE_ENTRY_TIMELINE.memberStaggerTicks;
      directives.set(
        memberId,
        tick < releaseTick
          ? {
              actorId: memberId,
              destination: officeEntryCellFor(memberId),
              facing: "up",
              terminalAction: "stand",
              travelAction: "walk",
              revisionKey: `entry-wait-${departmentId}-${memberId}`,
            }
          : {
              ...seatDirective(
                member,
                `entry-seat-${departmentId}-${memberId}`,
              ),
              travelAction: "walk",
            },
      );
    }
  }
  return ordered(directives);
}

function seatDirective(
  member: (typeof OFFICE_SCENE_MANIFEST.roster)[number],
  revisionKey: string,
): OfficeActorDirective {
  return {
    actorId: member.id,
    destination: member.workSeat.cell,
    facing: member.workSeat.facing,
    terminalAction: member.id === chair.id ? "idle" : "seated-work",
    travelAction: "return",
    revisionKey,
  };
}

function meetingSeatDirective(
  member: (typeof OFFICE_SCENE_MANIFEST.roster)[number],
  revisionKey: string,
  terminalAction: OfficeActorDirective["terminalAction"],
): OfficeActorDirective {
  return {
    actorId: member.id,
    destination: member.meetingSeat.cell,
    facing: member.meetingSeat.facing,
    terminalAction,
    travelAction: "walk",
    revisionKey,
  };
}

function representativeAnchor(departmentId: OfficeDepartmentId) {
  const department = OFFICE_SCENE_MANIFEST.departments[departmentId];
  const anchor = department.talkAnchors.find(
    (candidate) => candidate.agentId === department.representativeId,
  );
  if (!anchor)
    throw new RangeError(`${departmentId} has no representative anchor`);
  return anchor;
}

function seatedDirectives(
  revisionKey: string,
): Map<OfficeManifestAgentId, OfficeActorDirective> {
  return new Map(
    OFFICE_SCENE_MANIFEST.roster.map((member) => [
      member.id,
      seatDirective(member, revisionKey),
    ]),
  );
}

function departmentMeetingDirectives(
  revisionKey: string,
): Map<OfficeManifestAgentId, OfficeActorDirective> {
  const directives = seatedDirectives(revisionKey);
  for (const member of OFFICE_SCENE_MANIFEST.roster) {
    if (member.departmentId === "chair") continue;
    directives.set(
      member.id,
      meetingSeatDirective(member, revisionKey, "listen"),
    );
  }
  return directives;
}

function ordered(
  directives: ReadonlyMap<OfficeManifestAgentId, OfficeActorDirective>,
): readonly OfficeActorDirective[] {
  return OFFICE_SCENE_MANIFEST.roster.map(
    (member) => directives.get(member.id) ?? seatDirective(member, "fallback"),
  );
}

function departmentTalk(
  tick: number,
  releaseOrder: readonly OfficeDepartmentId[],
): readonly OfficeActorDirective[] {
  const directives = seatedDirectives("department-talk-pending");
  for (const [departmentIndex, departmentId] of releaseOrder.entries()) {
    const department = OFFICE_SCENE_MANIFEST.departments[departmentId];
    const releaseTick =
      OFFICE_DEPARTMENT_TALK_TIMELINE.firstReleaseTick +
      departmentIndex * OFFICE_DEPARTMENT_TALK_TIMELINE.releaseIntervalTicks;
    for (const [memberIndex, memberId] of department.memberIds.entries()) {
      // A short in-team stagger prevents specialists from trying to swap
      // through the same aisle while still reading as one team leaving.
      if (
        tick <
        releaseTick +
          memberIndex * OFFICE_DEPARTMENT_TALK_TIMELINE.memberStaggerTicks
      ) {
        continue;
      }
      const member = OFFICE_SCENE_MANIFEST.roster.find(
        (candidate) => candidate.id === memberId,
      );
      if (!member)
        throw new RangeError(`Missing department member ${memberId}`);
      directives.set(
        memberId,
        meetingSeatDirective(
          member,
          `department-talk-${departmentId}-${memberId}`,
          memberId === department.representativeId ? "talk" : "listen",
        ),
      );
    }
  }
  return ordered(directives);
}

function visit(
  pairs: readonly VisitPair[],
  revisionKey: string,
  hostsSpeak: boolean,
): readonly OfficeActorDirective[] {
  const directives = departmentMeetingDirectives(revisionKey);
  for (const pair of pairs) {
    const visitorDepartment =
      OFFICE_SCENE_MANIFEST.departments[pair.visitorDepartment];
    const hostDepartment =
      OFFICE_SCENE_MANIFEST.departments[pair.hostDepartment];
    const visitorId = visitorDepartment.representativeId;
    const hostId = hostDepartment.representativeId;
    const visitorAnchor = hostDepartment.visitorAnchor;
    const hostAnchor = representativeAnchor(pair.hostDepartment);
    directives.set(visitorId, {
      actorId: visitorId,
      destination: visitorAnchor.cell,
      facing: facingToward(visitorAnchor.cell, hostAnchor.cell),
      terminalAction: hostsSpeak ? "listen" : "talk",
      travelAction: "walk",
      revisionKey: `${revisionKey}-visitor`,
    });
    directives.set(hostId, {
      actorId: hostId,
      destination: hostAnchor.cell,
      facing: facingToward(hostAnchor.cell, visitorAnchor.cell),
      terminalAction: hostsSpeak ? "talk" : "listen",
      travelAction: "walk",
      revisionKey: `${revisionKey}-host`,
    });
  }
  return ordered(directives);
}

function representativesReady(
  revisionKey: string,
): readonly OfficeActorDirective[] {
  const directives = departmentMeetingDirectives(revisionKey);
  for (const department of Object.values(OFFICE_SCENE_MANIFEST.departments)) {
    const representativeId = department.representativeId;
    const anchor = department.talkAnchors.find(
      (candidate) => candidate.agentId === representativeId,
    );
    if (!anchor)
      throw new RangeError(`${representativeId} has no ready anchor`);
    directives.set(representativeId, {
      actorId: representativeId,
      destination: anchor.cell,
      facing: anchor.facing,
      terminalAction: "summarize",
      travelAction: "return",
      revisionKey,
    });
  }
  return ordered(directives);
}

function gathering(revisionKey: string): readonly OfficeActorDirective[] {
  const directives = seatedDirectives(revisionKey);
  for (const member of OFFICE_SCENE_MANIFEST.roster) {
    if (member.finalLocation !== "forum") continue;
    const anchor = forumAnchorFor(member.id);
    directives.set(member.id, {
      actorId: member.id,
      destination: anchor.cell,
      facing: anchor.facing,
      terminalAction: "idle",
      travelAction: "walk",
      revisionKey,
    });
  }
  return ordered(directives);
}

function stagedGathering(tick: number): readonly OfficeActorDirective[] {
  const directives = new Map(
    representativesReady("representative-gathering-ready").map((directive) => [
      directive.actorId,
      directive,
    ]),
  );
  const meetingPhase = officeMeetingPhaseAt(tick);
  for (const member of OFFICE_SCENE_MANIFEST.roster) {
    if (member.finalLocation !== "forum") continue;
    const releaseTick = OFFICE_MEETING_RELEASE_TICKS[member.id];
    if (releaseTick === undefined || tick < releaseTick) continue;
    const anchor = forumAnchorFor(member.id);
    directives.set(member.id, {
      actorId: member.id,
      destination: anchor.cell,
      facing: anchor.facing,
      terminalAction:
        meetingPhase === "opening"
          ? member.id === chair.id
            ? "talk"
            : "listen"
          : "idle",
      travelAction: "walk",
      revisionKey: `representative-gathering-${member.id}-${meetingPhase}`,
    });
  }
  return ordered(directives);
}

export function officeDirectivesAt(
  tick: number,
  departmentReleaseOrder: readonly OfficeDepartmentId[] = DEFAULT_OFFICE_DEPARTMENT_RELEASE_ORDER,
): readonly OfficeActorDirective[] {
  if (tick <= OFFICE_ENTRY_TIMELINE.endTick) {
    return entryDirectives(tick);
  }
  const beat = officeBeatAt(tick);
  switch (beat.id) {
    case "briefing": {
      const directives = seatedDirectives("briefing");
      directives.set(chair.id, {
        ...seatDirective(chair, "briefing-chair"),
        terminalAction: "talk",
      });
      return ordered(directives);
    }
    case "parallel-work": {
      const revision = tick < 80 ? 0 : tick < 140 ? 1 : tick < 200 ? 2 : 3;
      return ordered(seatedDirectives(`parallel-work-${revision}`));
    }
    case "department-talk":
      return departmentTalk(tick, departmentReleaseOrder);
    case "visit-wave-a":
      return tick >= 540
        ? representativesReady("return-a-approach")
        : visit(VISIT_WAVE_A, `visit-a-${tick < 500 ? 0 : 1}`, tick >= 500);
    case "return-a":
      return representativesReady("return-a-summary");
    case "visit-wave-b":
      return tick >= 900
        ? representativesReady("return-b-approach")
        : visit(VISIT_WAVE_B, `visit-b-${tick < 860 ? 0 : 1}`, tick >= 860);
    case "return-b":
      return representativesReady("return-b-summary");
    case "representative-gathering":
      return stagedGathering(tick);
    case "forum":
      return buildForumDirectives({
        baseDirectives: gathering("forum-base"),
        chairId: chair.id,
        tick,
      });
    case "complete":
      return gathering("complete");
    default:
      return assertNeverOffice(beat);
  }
}

export function officeCameraTargetAt(
  tick: number,
  departmentReleaseOrder: readonly OfficeDepartmentId[] = DEFAULT_OFFICE_DEPARTMENT_RELEASE_ORDER,
): OfficeCameraTarget {
  if (tick <= OFFICE_ENTRY_TIMELINE.endTick) return { kind: "overview" };
  const beat = officeBeatAt(tick);
  if (beat.id === "briefing") return { kind: "actors", actorIds: [chair.id] };
  if (beat.id === "parallel-work" || beat.id === "department-talk") {
    return { kind: "overview" };
  }
  const directives = officeDirectivesAt(tick, departmentReleaseOrder).filter(
    (directive) => directive.terminalAction !== "seated-work",
  );
  return {
    kind: "actors",
    actorIds: directives.map((directive) => directive.actorId),
  };
}
