import { OFFICE_ENTITY_GEOMETRY } from "./officeEntityGeometry";
import { OFFICE_ROOM_PLAQUES } from "./officeRoomPlaques";
import type {
  CellRect,
  OfficeManifestAgentId,
  WorldPoint,
} from "./officeSceneManifest";

export type OfficeEntityKind = "evidence-forum" | "room-sign";

export type OfficeEntityInteractionAnchor = {
  readonly actorId: OfficeManifestAgentId;
  readonly cell: { readonly x: number; readonly y: number };
};

export type OfficeEntityDefinition = {
  readonly id: string;
  readonly kind: OfficeEntityKind;
  readonly position: WorldPoint;
  readonly size: { readonly width: number; readonly height: number };
  readonly collisionFootprint: CellRect | null;
  readonly interactionAnchors: readonly OfficeEntityInteractionAnchor[];
  readonly zIndex: number;
};

const forum = OFFICE_ENTITY_GEOMETRY.evidenceForum;

export const OFFICE_ENTITY_MANIFEST: readonly OfficeEntityDefinition[] =
  Object.freeze([
    Object.freeze({
      id: forum.id,
      kind: "evidence-forum",
      position: forum.position,
      size: forum.size,
      collisionFootprint: forum.collisionFootprint,
      interactionAnchors: Object.freeze(
        Object.values(forum.anchors).map((anchor) =>
          Object.freeze({ actorId: anchor.agentId, cell: anchor.cell }),
        ),
      ),
      zIndex: 900,
    }),
    ...OFFICE_ROOM_PLAQUES.map((plaque) => {
      const geometry = OFFICE_ENTITY_GEOMETRY.roomSigns[plaque.id];
      return Object.freeze({
        id: `room-sign-${plaque.id}`,
        kind: "room-sign" as const,
        position: Object.freeze({ x: geometry.x, y: geometry.y }),
        size: Object.freeze({
          width: geometry.width,
          height: geometry.height,
        }),
        collisionFootprint: null,
        interactionAnchors: Object.freeze([]),
        zIndex: 1_000,
      });
    }),
  ]);
