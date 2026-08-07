import type { OfficeActorDirective } from "./officeChoreographyV7Contract";
import { facingToward } from "./officeFacingV7";
import {
  OFFICE_MEETING_TIMELINE,
  officeMeetingPhaseAt,
} from "./officeMeetingChoreography";
import {
  OFFICE_SCENE_MANIFEST,
  type OfficeManifestAgentId,
} from "./officeSceneManifest";

export type OfficeForumDirectiveInput = {
  readonly baseDirectives: readonly OfficeActorDirective[];
  readonly chairId: OfficeManifestAgentId;
  readonly tick: number;
};

export function forumAnchorFor(actorId: OfficeManifestAgentId) {
  const anchor = Object.values(OFFICE_SCENE_MANIFEST.forum.anchors).find(
    (candidate) => candidate.agentId === actorId,
  );
  if (!anchor) throw new RangeError(`${actorId} has no forum anchor`);
  return anchor;
}

export function buildForumDirectives(
  input: OfficeForumDirectiveInput,
): readonly OfficeActorDirective[] {
  const directives = new Map(
    input.baseDirectives.map((directive) => [directive.actorId, directive]),
  );
  const representatives = Object.values(OFFICE_SCENE_MANIFEST.departments).map(
    (department) => department.representativeId,
  );
  const phase = officeMeetingPhaseAt(input.tick);
  const speakerIndex = Math.min(
    Math.floor(
      (input.tick - OFFICE_MEETING_TIMELINE.reportsTick) /
        OFFICE_MEETING_TIMELINE.presentationTicks,
    ),
    representatives.length - 1,
  );
  const speakerId =
    phase === "challenge-round"
      ? OFFICE_SCENE_MANIFEST.departments.risk.representativeId
      : phase === "department-reports"
        ? representatives[speakerIndex]
        : undefined;
  for (const representativeId of representatives) {
    const anchor = forumAnchorFor(representativeId);
    directives.set(representativeId, {
      actorId: representativeId,
      destination: anchor.cell,
      facing: anchor.facing,
      terminalAction: representativeId === speakerId ? "present" : "listen",
      travelAction: "walk",
      revisionKey: `forum-${phase}-${speakerIndex}-${representativeId}`,
    });
  }
  const chairAnchor = forumAnchorFor(input.chairId);
  const speakerAnchor = speakerId ? forumAnchorFor(speakerId) : null;
  directives.set(input.chairId, {
    actorId: input.chairId,
    destination: chairAnchor.cell,
    facing: speakerAnchor
      ? facingToward(chairAnchor.cell, speakerAnchor.cell)
      : chairAnchor.facing,
    terminalAction:
      phase === "chair-synthesis" || phase === "complete"
        ? "chair-synthesis"
        : "listen",
    travelAction: "walk",
    revisionKey: `forum-${phase}-${speakerIndex}-chair`,
  });
  return OFFICE_SCENE_MANIFEST.roster.map((member) => {
    const directive = directives.get(member.id);
    if (!directive)
      throw new RangeError(`Missing forum directive ${member.id}`);
    return directive;
  });
}
