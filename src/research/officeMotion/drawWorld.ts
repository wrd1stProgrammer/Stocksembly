import type { AppLocale } from "../../lib/i18n";
import { drawActor } from "./actors";
import { asset } from "./canvasPrimitives";
import { type ChairSeat, drawChairBase, drawChairFront } from "./chairs";
import {
  drawDepartmentTable,
  drawDesk,
  drawForumFloor,
  drawForumTable,
} from "./furniture";
import { FORUM_PLACES, ROSTER, TEAM_TABLES, WALLS, WORLD } from "./layout";
import { drawRoomSigns } from "./signs";
import type { Assets, SceneFrame } from "./types";

type Layer = { readonly depth: number; readonly draw: () => void };

/** Draws the approved office in world coordinates; the caller owns the camera. */
export function drawWorld(
  ctx: CanvasRenderingContext2D,
  assets: Assets,
  frame: SceneFrame,
  locale: AppLocale,
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(asset(assets, "office"), 0, 0, WORLD.width, WORLD.height);
  drawForumFloor(ctx);
  const layers: Layer[] = [];
  const chairLayer = (seat: ChairSeat): void => {
    layers.push({ depth: seat.y - 30, draw: () => drawChairBase(ctx, seat) });
    layers.push({ depth: seat.y + 0.5, draw: () => drawChairFront(ctx, seat) });
  };
  for (const table of TEAM_TABLES) {
    layers.push({
      depth: table.center.y + 20,
      draw: () =>
        drawDepartmentTable(ctx, table.center.x, table.center.y, table.color),
    });
    for (const seat of table.seats)
      chairLayer({ ...seat.position, facing: seat.facing });
  }
  for (const member of ROSTER) {
    const actor = frame.actors.find((entry) => entry.id === member.id);
    const atWork =
      actor &&
      Math.hypot(
        actor.position.x - member.seat.x,
        actor.position.y - member.seat.y,
      ) < 1;
    const progress = atWork
      ? actor.action === "stand"
        ? actor.progress
        : actor.seated
          ? 0
          : 1
      : 1;
    const pulledOut = progress * progress * (3 - 2 * progress);
    chairLayer({
      x: member.seat.x - 36 * pulledOut,
      y: member.seat.y - 10 * pulledOut,
      facing: member.homeFacing,
    });
    layers.push({
      depth: member.seat.y - 1,
      draw: () => drawDesk(ctx, member, actor, assets, frame.time, true),
    });
    layers.push({
      depth: member.seat.y + 6,
      draw: () => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(member.seat.x - 70, member.seat.y - 21, 140, 90);
        ctx.clip();
        drawDesk(ctx, member, actor, assets, frame.time, true);
        ctx.restore();
      },
    });
  }
  for (const seat of Object.values(FORUM_PLACES))
    chairLayer({ ...seat.position, facing: seat.facing });
  layers.push({ depth: 472, draw: () => drawForumTable(ctx) });
  for (const actor of frame.actors) {
    const member = ROSTER.find((entry) => entry.id === actor.id);
    if (!member) continue;
    layers.push({
      depth: actor.position.y,
      draw: () => drawActor(ctx, actor, member, assets, frame.time, true),
    });
  }
  layers.sort((a, b) => a.depth - b.depth);
  for (const layer of layers) layer.draw();
  const image = asset(assets, "office");
  for (const wall of WALLS) {
    const touches = frame.actors.some(
      ({ position }) =>
        position.x > wall.x - 38 &&
        position.x < wall.x + wall.width + 38 &&
        position.y < wall.y + wall.height &&
        position.y > wall.y - 20,
    );
    if (!touches) continue;
    ctx.drawImage(
      image,
      wall.x,
      wall.y,
      wall.width,
      wall.height,
      wall.x,
      wall.y,
      wall.width,
      wall.height,
    );
  }
  drawRoomSigns(ctx, locale);
  ctx.restore();
}
