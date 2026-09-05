import { cleanSheet, legLayer } from "./actorTextures";
import type { Facing } from "./types";

export const ACTOR_SCALE = 0.6;
export const CELL = {
  width: 160,
  height: 192,
  foot: 174,
  neck: 96,
  hip: 137,
} as const;
export const ROW: Readonly<Record<Facing, number>> = {
  down: 0,
  right: 1,
  left: 2,
  up: 3,
};
type SpriteParts = {
  readonly sheet: HTMLCanvasElement;
  readonly legs: ReadonlyMap<Facing, readonly HTMLCanvasElement[]>;
  readonly seatedLegs: ReadonlyMap<Facing, HTMLCanvasElement>;
  readonly torso: ReadonlyMap<Facing, HTMLCanvasElement>;
  readonly heads: ReadonlyMap<Facing, HTMLCanvasElement>;
  readonly skin: string;
  readonly sleeve: string;
  readonly sleeveLight: string;
  readonly sleeveShade: string;
  readonly skinShade: string;
};
type RGB = readonly [number, number, number];
// Each loaded sheet owns its derived layers; source images remain untouched.
const partsCache = new WeakMap<HTMLImageElement, SpriteParts>();

function canvas(width: number, height: number): HTMLCanvasElement {
  const result = document.createElement("canvas");
  result.width = width;
  result.height = height;
  return result;
}
function color(rgb: RGB, shift = 0): string {
  return `rgb(${rgb.map((value) => Math.max(0, Math.min(255, value + shift))).join(" ")})`;
}
function dominant(
  data: ImageData,
  region: readonly [number, number, number, number],
): RGB {
  const colors = new Map<string, { readonly rgb: RGB; count: number }>();
  const [x, y, width, height] = region;
  for (let row = y; row < y + height; row += 1) {
    for (let col = x; col < x + width; col += 1) {
      const offset = (row * data.width + col) * 4;
      const r = data.data[offset] ?? 0;
      const g = data.data[offset + 1] ?? 0;
      const b = data.data[offset + 2] ?? 0;
      const alpha = data.data[offset + 3] ?? 0;
      if (alpha < 180) continue;
      const key = `${r >> 4},${g >> 4},${b >> 4}`;
      const previous = colors.get(key);
      if (previous) previous.count += 1;
      else colors.set(key, { rgb: [r, g, b], count: 1 });
    }
  }
  let winner: RGB = [95, 103, 103];
  let count = 0;
  for (const entry of colors.values())
    if (entry.count > count) {
      winner = entry.rgb;
      count = entry.count;
    }
  return winner;
}
function sideTorso(
  sheet: HTMLCanvasElement,
  facing: "left" | "right",
  id: string,
): HTMLCanvasElement {
  const result = canvas(160, 43);
  const ctx = result.getContext("2d");
  const source = sheet.getContext("2d");
  if (!ctx || !source) throw new TypeError("Canvas2D is unavailable");
  const palette = source.getImageData(0, 94, 160, 43);
  const slim = [
    "market",
    "market_news",
    "company_product",
    "valuation",
    "financial_quality",
  ].includes(id);
  const back = slim ? 72 : 66;
  const outline = new Path2D();
  outline.moveTo(79, 0);
  outline.quadraticCurveTo(back + 2, 1, back, 9);
  outline.quadraticCurveTo(back - 1, 20, back + 1, 31);
  outline.lineTo(back + 1, 43);
  outline.lineTo(96, 43);
  outline.quadraticCurveTo(99, 28, 97, 17);
  outline.quadraticCurveTo(95, 4, 87, 1);
  outline.closePath();
  const orient = (): void => {
    if (facing === "left") {
      ctx.translate(160, 0);
      ctx.scale(-1, 1);
    }
  };
  ctx.save();
  orient();
  ctx.clip(outline);
  // The old arm hides the back in the side sheet. Reconstruct its fabric from
  // the front jacket panel row by row, retaining the original hem and trousers.
  for (let y = 0; y < 43; y++) {
    const sampleY = Math.max(0, y - 2);
    const fabric = dominant(palette, [
      68,
      sampleY,
      7,
      Math.min(5, 43 - sampleY),
    ]);
    ctx.fillStyle = color(fabric);
    ctx.fillRect(back - 2, y, 37, 1);
    ctx.fillStyle = color(fabric, -14);
    ctx.fillRect(back - 1, y, 3, 1);
  }
  ctx.restore();
  ctx.save();
  orient();
  ctx.clip(outline);
  ctx.beginPath();
  ctx.rect(84, 0, 76, 43);
  ctx.clip();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(sheet, 0, ROW[facing] * 192 + 94, 160, 43, 0, 0, 160, 43);
  ctx.restore();
  ctx.save();
  orient();
  ctx.strokeStyle = color(dominant(palette, [68, 10, 7, 20]), -40);
  ctx.lineWidth = 0.7;
  ctx.stroke(outline);
  ctx.restore();
  return result;
}
function splitFacing(
  sheet: HTMLCanvasElement,
  facing: Facing,
  id: string,
): readonly [HTMLCanvasElement, HTMLCanvasElement] {
  const head = canvas(160, 128);
  const side = facing === "left" || facing === "right";
  const torso = side ? sideTorso(sheet, facing, id) : canvas(160, 43);
  const headContext = head.getContext("2d");
  const bodyContext = torso.getContext("2d");
  const row = ROW[facing] * CELL.height;
  if (headContext) {
    headContext.drawImage(sheet, 0, row, 160, 128, 0, 0, 160, 128);
    headContext.globalCompositeOperation = "destination-in";
    headContext.beginPath();
    headContext.rect(0, 0, 160, 92);
    headContext.rect(66, 90, 30, 6);
    if (id === "market_news") {
      if (facing === "up") {
        headContext.moveTo(49, 92);
        headContext.lineTo(111, 92);
        headContext.lineTo(102, 107);
        headContext.lineTo(88, 116);
        headContext.lineTo(71, 115);
        headContext.lineTo(56, 107);
        headContext.closePath();
      } else if (facing === "right") headContext.rect(48, 92, 26, 20);
      else if (facing === "left") headContext.rect(89, 92, 25, 20);
      else {
        headContext.rect(47, 92, 15, 17);
        headContext.rect(100, 92, 13, 14);
      }
    } else if (id === "valuation") {
      if (facing === "up") headContext.rect(48, 90, 65, 5);
      else if (facing === "right") headContext.rect(49, 90, 24, 5);
      else if (facing === "left") headContext.rect(90, 90, 24, 5);
    } else if (id === "company_product") {
      if (facing === "up") headContext.rect(69, 92, 25, 20);
      else if (facing === "right") headContext.rect(54, 92, 20, 16);
      else if (facing === "left") headContext.rect(91, 92, 20, 16);
      else headContext.rect(54, 92, 11, 9);
    }
    headContext.fill();
  }
  if (bodyContext && !side) {
    bodyContext.drawImage(sheet, 0, row + 94, 160, 43, 0, 0, 160, 43);
    bodyContext.globalCompositeOperation = "destination-in";
    bodyContext.beginPath();
    bodyContext.moveTo(66, 0);
    bodyContext.lineTo(96, 0);
    bodyContext.lineTo(93, 25);
    bodyContext.lineTo(id === "chair" ? 99 : 96, 48);
    bodyContext.lineTo(id === "chair" ? 62 : 65, 48);
    bodyContext.lineTo(68, 25);
    bodyContext.closePath();
    bodyContext.fill();
  }
  return [head, torso];
}
export function spriteParts(sheet: HTMLImageElement): SpriteParts {
  const cached = partsCache.get(sheet);
  if (cached) return cached;
  const cleaned = cleanSheet(sheet);
  const surface = canvas(160, 192);
  const context = surface.getContext("2d");
  if (!context) throw new TypeError("Canvas2D is unavailable");
  context.drawImage(cleaned, 0, 0, 160, 192, 0, 0, 160, 192);
  const pixels = context.getImageData(0, 0, 160, 192);
  const skin = dominant(pixels, [72, 73, 17, 10]);
  const sleeve = dominant(pixels, [58, 105, 12, 20]);
  const id = sheet.src.split("/").at(-1)?.replace(".png", "") ?? "";
  const legs = new Map<Facing, readonly HTMLCanvasElement[]>();
  const seatedLegs = new Map<Facing, HTMLCanvasElement>();
  const heads = new Map<Facing, HTMLCanvasElement>();
  const torso = new Map<Facing, HTMLCanvasElement>();
  for (const facing of ["down", "right", "left", "up"] as const) {
    const [head, body] = splitFacing(cleaned, facing, id);
    heads.set(facing, head);
    torso.set(facing, body);
    legs.set(
      facing,
      [0, 1, 2].map((column) => legLayer(cleaned, id, facing, column)),
    );
    seatedLegs.set(facing, legLayer(cleaned, id, facing, 3, true));
  }
  const result = {
    sheet: cleaned,
    legs,
    seatedLegs,
    heads,
    torso,
    skin: color(skin),
    sleeve: color(sleeve),
    sleeveLight: color(sleeve, 12),
    sleeveShade: color(sleeve, -55),
    skinShade: color(skin, -32),
  };
  partsCache.set(sheet, result);
  return result;
}
export type Arm = {
  readonly shoulder: readonly [number, number];
  readonly elbow: readonly [number, number];
  readonly hand: readonly [number, number];
  readonly grip: number;
  readonly articulated: boolean;
};
export function drawArm(
  context: CanvasRenderingContext2D,
  parts: SpriteParts,
  arm: Arm,
): void {
  const [sx, sy] = arm.shoulder;
  const [ex, ey] = arm.elbow;
  const [hx, hy] = arm.hand;
  const length = Math.max(1, Math.hypot(hx - ex, hy - ey));
  const wx = hx - ((hx - ex) / length) * 3.2;
  const wy = hy - ((hy - ey) / length) * 3.2;
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  const upperLength = Math.max(1, Math.hypot(ex - sx, ey - sy));
  const path = (offset: number): void => {
    context.beginPath();
    context.moveTo(sx + offset, sy);
    if (arm.articulated) {
      context.lineTo(
        ex - ((ex - sx) / upperLength) * 2.5 + offset,
        ey - ((ey - sy) / upperLength) * 2.5,
      );
      context.quadraticCurveTo(
        ex + offset,
        ey,
        ex + ((hx - ex) / length) * 2.5 + offset,
        ey + ((hy - ey) / length) * 2.5,
      );
      context.lineTo(wx + offset, wy);
    } else context.quadraticCurveTo(ex + offset, ey, wx + offset, wy);
  };
  path(0);
  context.strokeStyle = parts.sleeveShade;
  context.lineWidth = 7.5;
  context.stroke();
  context.strokeStyle = parts.sleeve;
  context.lineWidth = 6;
  context.stroke();
  path(-0.6);
  context.strokeStyle = parts.sleeveLight;
  context.lineWidth = 0.65;
  context.stroke();
  const nx = -(hy - ey) / length,
    ny = (hx - ex) / length;
  context.beginPath();
  context.moveTo(wx + nx * 2.5, wy + ny * 2.5);
  context.lineTo(wx - nx * 2.5, wy - ny * 2.5);
  context.strokeStyle = parts.sleeveLight;
  context.lineWidth = 1;
  context.stroke();
  context.restore();
}
export function drawHand(
  context: CanvasRenderingContext2D,
  parts: SpriteParts,
  arm: Arm,
): void {
  context.save();
  context.translate(...arm.hand);
  if (!arm.grip)
    context.rotate(
      Math.atan2(arm.hand[1] - arm.elbow[1], arm.hand[0] - arm.elbow[0]) -
        Math.PI / 2,
    );
  context.fillStyle = parts.skin;
  context.strokeStyle = parts.skinShade;
  context.lineWidth = 0.5;
  context.beginPath();
  context.ellipse(0, 0.7, arm.grip ? 2.1 : 2.7, 3.2, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  if (arm.grip) {
    context.beginPath();
    context.ellipse(
      -arm.grip * 1.8,
      0.2,
      1.2,
      1.7,
      arm.grip * 0.4,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  context.restore();
}
export type SheetPose = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly angle: number;
};
export function drawPaper(
  context: CanvasRenderingContext2D,
  sheet: SheetPose | null,
  accent: string,
  evidence: boolean,
): void {
  if (!sheet) return;
  context.save();
  context.translate(sheet.x, sheet.y);
  context.rotate(sheet.angle);
  context.scale(sheet.width / 28, 1);
  context.fillStyle = "#f5eedb";
  context.strokeStyle = "#aa9b80";
  context.lineWidth = 0.8;
  context.beginPath();
  context.roundRect(-14, -sheet.height / 2, 28, sheet.height, 1);
  context.fill();
  context.stroke();
  context.fillStyle = accent;
  context.fillRect(-10, -8, 12, 2.5);
  context.fillStyle = "#8d928b";
  for (let line = 0; line < 3; line += 1)
    context.fillRect(-10, -2 + line * 4, line === 2 ? 12 : 20, 1);
  if (evidence) {
    context.fillStyle = accent;
    context.fillRect(7, 4, 3, 5);
  }
  context.restore();
}
export function drawShadow(
  context: CanvasRenderingContext2D,
  seat: number,
): void {
  const gradient = context.createRadialGradient(0, 1, 1, 0, 1, 24);
  gradient.addColorStop(0, "rgba(33, 30, 26, .18)");
  gradient.addColorStop(1, "rgba(33, 30, 26, 0)");
  context.save();
  context.scale(1, 0.3);
  context.fillStyle = gradient;
  context.beginPath();
  context.ellipse(0, 3, 24 - seat * 3, 24, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();
}
