import { asset, ellipse, line, panel, text } from "./canvasPrimitives";
import type { ActorDefinition, ActorFrame, Assets } from "./types";

export function drawDesk(
  ctx: CanvasRenderingContext2D,
  member: ActorDefinition,
  actor: ActorFrame | undefined,
  assets: Assets,
  time: number,
  improved: boolean,
): void {
  const { x, y } = member.seat;
  ctx.save();
  ctx.shadowColor = "#24231d30";
  ctx.shadowBlur = 9;
  ctx.shadowOffsetY = 5;
  ctx.drawImage(asset(assets, "desk"), x - 64, y - 27, 128, 68);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  const surface = ctx.createLinearGradient(0, y - 22, 0, y + 23);
  surface.addColorStop(0, "#eadcc8");
  surface.addColorStop(0.55, "#f0e7d9");
  surface.addColorStop(1, "#d9cbb7");
  ctx.beginPath();
  ctx.roundRect(x - 57, y - 22, 114, 45, 3);
  ctx.fillStyle = surface;
  ctx.fill();
  line(
    ctx,
    [
      [x - 56, y - 20],
      [x + 56, y - 20],
    ],
    "#fff8ec",
    1.5,
  );
  panel(ctx, x - 22, y - 24, 44, 15, 2, "#748187", "#aab8ba");
  panel(ctx, x - 18, y - 22, 36, 9, 1, "#35464e");
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 9; col++)
      ctx.fillRect(x - 16 + col * 4, y - 20 + row * 3, 2.5, 1.5);
  panel(ctx, x - 7, y - 12, 14, 2, 1, "#a5b0b2");
  const active =
    actor?.seated === true &&
    actor.action !== "listen" &&
    Math.hypot(actor.position.x - x, actor.position.y - y) < 2;
  const screenY = y - 5;
  panel(ctx, x - 27, screenY, 54, 29, 3, "#a9b2b1", "#e5e6de");
  panel(
    ctx,
    x - 24,
    screenY + 3,
    48,
    21,
    2,
    active && improved ? "#182e3b" : "#253a43",
  );
  if (active && improved) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 23, screenY + 4, 46, 19);
    ctx.clip();
    const reveal = Math.floor(time * 3 + member.seat.x) % 7;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i === reveal % 4 ? member.color : "#617d87";
      ctx.fillRect(
        x - 20,
        screenY + 6 + i * 4,
        10 + ((i * 7 + reveal * 3) % 29),
        1.3,
      );
    }
    line(
      ctx,
      [
        [x + 5, screenY + 18],
        [x + 10, screenY + 12],
        [x + 14, screenY + 14],
        [x + 18, screenY + 7],
      ],
      member.color,
      1.1,
    );
    ctx.restore();
    ctx.fillStyle = member.color;
    ctx.fillRect(x + 20, screenY + 26, 2, 1);
  } else
    line(
      ctx,
      [
        [x - 16, screenY + 15],
        [x - 8, screenY + 15],
      ],
      member.color,
      1.3,
    );
  panel(ctx, x + 36, y - 9, 16, 22, 1, "#fdf8eb", "#cbbfae");
  for (let i = 0; i < 4; i++)
    line(
      ctx,
      [
        [x + 39, y - 4 + i * 4],
        [x + 49, y - 4 + i * 4],
      ],
      "#b1b2a5",
      0.8,
    );
  line(
    ctx,
    [
      [x + 32, y - 4],
      [x + 33, y + 9],
    ],
    "#54616a",
    2,
  );
  ellipse(ctx, x - 44, y + 4, 5.5, 3, "#b9aaa0");
  panel(ctx, x - 49, y - 3, 10, 8, 2, "#d9ddd5");
  ellipse(ctx, x - 44, y - 3, 5, 2.5, "#f7f5e8");
  ellipse(ctx, x - 44, y - 3, 3.4, 1.6, "#66523e");
  ctx.restore();
}

export function drawForumFloor(ctx: CanvasRenderingContext2D): void {
  ellipse(ctx, 744, 478, 164, 103, "#262e302a");
  ellipse(ctx, 744, 470, 164, 103, "#6a7773");
  ellipse(ctx, 744, 470, 159, 98, "#b6afa0");
  ellipse(ctx, 744, 470, 154, 93, "#435a5b");
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.ellipse(744, 470, 142, 83, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "#d9c39b";
  ctx.stroke();
  ctx.restore();
}

export function drawForumTable(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ellipse(ctx, 744, 477, 117, 49, "#111b2250");
  panel(ctx, 679, 463, 10, 45, 3, "#3b4344");
  panel(ctx, 799, 463, 10, 45, 3, "#3b4344");
  ellipse(ctx, 744, 461, 116, 51, "#73746c");
  ellipse(ctx, 744, 454, 118, 51, "#c0a77f");
  const wood = ctx.createLinearGradient(0, 404, 0, 505);
  wood.addColorStop(0, "#f0e0c6");
  wood.addColorStop(0.48, "#d7bf9b");
  wood.addColorStop(1, "#bda17d");
  ctx.beginPath();
  ctx.ellipse(744, 452, 114, 48, 0, 0, Math.PI * 2);
  ctx.fillStyle = wood;
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (let i = 0; i < 13; i++)
    line(
      ctx,
      [
        [625, 410 + i * 8],
        [863, 411 + i * 8],
      ],
      i % 2 ? "#92775a16" : "#fff9dc20",
    );
  ctx.restore();
  panel(ctx, 688, 425, 112, 51, 8, "#334246", "#708783");
  panel(ctx, 693, 430, 102, 41, 5, "#1c3037");
  text(ctx, "STOCKSEMBLY", 707, 453, 8, "#7e9292", 600);
  for (const x of [657, 817]) {
    panel(ctx, x, 439, 14, 22, 1, "#f7efdf", "#ae9f88");
    line(
      ctx,
      [
        [x + 3, 445],
        [x + 10, 445],
      ],
      "#8c9a95",
      1,
    );
  }
  ctx.restore();
}

export function drawDepartmentTable(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  accent: string,
): void {
  ctx.save();
  ellipse(ctx, x, y + 16, 91, 32, "#37362925");
  panel(ctx, x - 63, y + 7, 8, 28, 2, "#62686a");
  panel(ctx, x + 55, y + 7, 8, 28, 2, "#62686a");
  ellipse(ctx, x, y + 5, 90, 33, "#9c998d");
  const surface = ctx.createLinearGradient(0, y - 32, 0, y + 32);
  surface.addColorStop(0, "#f1e7d6");
  surface.addColorStop(1, "#cfc2aa");
  ctx.beginPath();
  ctx.ellipse(x, y, 90, 32, 0, 0, Math.PI * 2);
  ctx.fillStyle = surface;
  ctx.fill();
  ctx.strokeStyle = "#f3eada";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  panel(ctx, x - 29, y - 18, 58, 33, 4, "#46595c", "#8c9c99");
  panel(ctx, x - 25, y - 14, 50, 25, 2, "#203942");
  line(
    ctx,
    [
      [x - 18, y + 2],
      [x - 8, y - 4],
      [x, y],
      [x + 9, y - 8],
      [x + 18, y - 4],
    ],
    accent,
    1.5,
  );
  panel(ctx, x + 44, y - 12, 18, 24, 1, "#faf3e3", "#baad94");
  for (let i = 0; i < 3; i++)
    line(
      ctx,
      [
        [x + 48, y - 7 + i * 5],
        [x + 58, y - 7 + i * 5],
      ],
      "#9fa59b",
      0.8,
    );
  ellipse(ctx, x - 54, y + 5, 7, 3, "#a79a83");
  panel(ctx, x - 59, y - 5, 10, 9, 2, "#dbe1d7");
  ellipse(ctx, x - 54, y - 5, 5, 2, "#fff9e7");
  ctx.restore();
}
