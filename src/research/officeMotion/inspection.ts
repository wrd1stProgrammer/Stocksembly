import type {
  OfficeFurnitureRenderState,
  OfficeSeatRenderState,
} from "../officeGameFurniture";
import { FORUM_PLACES, ROSTER, TEAM_TABLES } from "./layout";
import type { ActorId, SceneFrame, SeatPlace } from "./types";

export function motionFurniture(
  frame: SceneFrame,
): readonly OfficeFurnitureRenderState[] {
  const seat = (id: ActorId, place: SeatPlace): OfficeSeatRenderState => ({
    actorId: id,
    position: place.position,
    laptopPosition: place.position,
    facing: place.facing,
    occupied: frame.actors.some(
      (actor) =>
        actor.id === id &&
        actor.seated &&
        Math.hypot(
          actor.position.x - place.position.x,
          actor.position.y - place.position.y,
        ) < 2,
    ),
  });
  return [
    ...ROSTER.map((member) => ({
      id: `${member.id}-workstation`,
      kind: "desk" as const,
      purpose:
        member.id === "chair" ? ("chair" as const) : ("workstation" as const),
      assetPath: null,
      accent: Number.parseInt(member.color.slice(1), 16),
      position: member.seat,
      size: { width: 128, height: 68 },
      zIndex: member.seat.y,
      seats: [
        seat(member.id, { position: member.seat, facing: member.homeFacing }),
      ],
    })),
    ...TEAM_TABLES.map((table) => ({
      id: `${table.id}-table`,
      kind: "oval" as const,
      purpose: "meeting" as const,
      assetPath: null,
      accent: Number.parseInt(table.color.slice(1), 16),
      position: table.center,
      size: { width: 180, height: 64 },
      zIndex: table.center.y + 20,
      seats: table.seats.map((place) => seat(place.id, place)),
    })),
    {
      id: "evidence-forum",
      kind: "oval",
      purpose: "meeting",
      assetPath: null,
      accent: 0xd9b77d,
      position: { x: 744, y: 454 },
      size: { width: 236, height: 102 },
      zIndex: 472,
      seats: ROSTER.flatMap((member) => {
        const place = Object.entries(FORUM_PLACES).find(
          ([id]) => id === member.id,
        )?.[1];
        return place ? [seat(member.id, place)] : [];
      }),
    },
  ];
}
