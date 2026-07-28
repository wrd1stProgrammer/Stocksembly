import type { OfficeActorDirective } from "./officeChoreographyV7Contract";
import { facingToward } from "./officeFacingV7";
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
  const speakerIndex = Math.min(Math.floor((input.tick - 1300) / 60), 4);
  const speakerId = representatives[speakerIndex];
  for (const representativeId of representatives) {
    const anchor = forumAnchorFor(representativeId);
    directives.set(representativeId, {
      actorId: representativeId,
      destination: anchor.cell,
      facing: anchor.facing,
      terminalAction: representativeId === speakerId ? "present" : "listen",
      travelAction: "walk",
      revisionKey: `forum-${speakerIndex}-${representativeId}`,
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
    terminalAction: speakerId ? "listen" : "chair-synthesis",
    travelAction: "walk",
    revisionKey: `forum-${speakerIndex}-chair`,
  });
  return OFFICE_SCENE_MANIFEST.roster.map((member) => {
    const directive = directives.get(member.id);
    if (!directive)
      throw new RangeError(`Missing forum directive ${member.id}`);
    return directive;
  });
}
