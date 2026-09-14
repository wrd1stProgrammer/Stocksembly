import { line, panel } from "./canvasPrimitives";
import { TEAM_TABLES } from "./layout";
import type { SceneFrame } from "./types";
export function drawInvestigationPapers(
  ctx: CanvasRenderingContext2D,
  frame: SceneFrame,
): void {
  const moment = frame.investigation;
  if (moment?.phase !== "compare") return;
  const table = TEAM_TABLES.find((t) => t.id === moment.team);
  if (!table) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, moment.progress * 8);
  for (const [offset, color] of [
    [-48, "#7d9ba3"],
    [48, "#aaa17d"],
  ] as const) {
    ctx.save();
    ctx.translate(table.center.x + offset, table.center.y + 13);
    ctx.transform(1, 0, -0.16, 0.55, 0, 0);
    panel(ctx, -11, -10, 22, 20, 1, "#eee6d3", "#b8ad95");
    line(
      ctx,
      [
        [-7, 2],
        [-3, -3],
        [1, 0],
        [7, -5],
      ],
      color,
      1.1,
    );
    line(
      ctx,
      [
        [-7, 6],
        [7, 6],
      ],
      "#a5aaa0",
      0.8,
    );
    ctx.restore();
  }
  ctx.restore();
}
export function drawInvestigationHandoff(
  ctx: CanvasRenderingContext2D,
  frame: SceneFrame,
): void {
  const moment = frame.investigation;
  if (moment?.phase !== "handoff") return;
  const receiver = frame.actors.find((a) => a.id === moment.participants[0]),
    sender = frame.actors.find((a) => a.id === moment.participants[1]);
  if (!receiver || !sender) return;
  const p = Math.min(1, Math.max(0, (moment.progress - 0.15) / 0.55));
  const eased = p * p * (3 - 2 * p);
  const x =
    sender.position.x -
    14 +
    (receiver.position.x + 14 - (sender.position.x - 14)) * eased;
  const y =
    sender.position.y - 29 + (receiver.position.y - sender.position.y) * eased;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.07 + eased * 0.14);
  panel(ctx, -7, -9, 14, 18, 1, "#eee6d3", "#b8ad95");
  for (let i = 0; i < 3; i++)
    line(
      ctx,
      [
        [-4, -4 + i * 4],
        [4, -4 + i * 4],
      ],
      i ? "#a5aaa0" : "#7e9eaa",
      0.8,
    );
  ctx.restore();
}
