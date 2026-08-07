import type { OfficeAgentVisualPose } from "./officeAgentVisualContract";
import type { OfficeActorAction } from "./officeChoreography";
import {
  type Cell,
  OFFICE_SCENE_MANIFEST,
  type OfficeManifestAgentId,
} from "./officeSceneManifest";

export type OfficeConversationRole = "listener" | "speaker" | null;

export type OfficeVisualPoseInput = {
  readonly action: OfficeActorAction;
  readonly atWorkSeat: boolean;
  readonly conversationRole: OfficeConversationRole;
};

export function officeVisualPoseFor(
  input: OfficeVisualPoseInput,
): OfficeAgentVisualPose {
  if (input.action === "walk" || input.action === "return") return "walk";
  if (input.atWorkSeat) {
    if (input.conversationRole === "speaker") return "seated-talk";
    if (input.conversationRole === "listener") return "seated-listen";
    if (
      input.action === "talk" ||
      input.action === "present" ||
      input.action === "summarize" ||
      input.action === "chair-synthesis"
    ) {
      return "seated-talk";
    }
    if (input.action === "listen") return "seated-listen";
    return "seated-work";
  }
  if (input.conversationRole === "speaker") return "talk";
  if (input.conversationRole === "listener") return "listen";
  switch (input.action) {
    case "chair-synthesis":
    case "present":
    case "summarize":
      return "present";
    case "listen":
      return "listen";
    case "talk":
      return "talk";
    case "idle":
    case "orient":
    case "seated-work":
    case "stand":
      return "idle";
  }
}

function contains(
  bounds: { readonly min: Cell; readonly max: Cell },
  cell: Cell,
): boolean {
  return (
    cell.x >= bounds.min.x &&
    cell.x <= bounds.max.x &&
    cell.y >= bounds.min.y &&
    cell.y <= bounds.max.y
  );
}

function roomIdAt(cell: Cell): string | null {
  const entry = Object.entries(OFFICE_SCENE_MANIFEST.rooms).find(([, room]) =>
    contains(room.bounds, cell),
  );
  return entry?.[0] ?? null;
}

export function sharesPhysicalConversationSpace(
  first: Cell,
  second: Cell,
): boolean {
  const firstRoom = roomIdAt(first);
  const distance = Math.abs(first.x - second.x) + Math.abs(first.y - second.y);
  return firstRoom !== null && firstRoom === roomIdAt(second) && distance <= 6;
}

export function conversationRoleFor(
  actorId: OfficeManifestAgentId,
  conversation:
    | {
        readonly speakerId: OfficeManifestAgentId;
        readonly participantIds: readonly OfficeManifestAgentId[];
      }
    | undefined,
): OfficeConversationRole {
  if (!conversation?.participantIds.includes(actorId)) return null;
  return actorId === conversation.speakerId ? "speaker" : "listener";
}
