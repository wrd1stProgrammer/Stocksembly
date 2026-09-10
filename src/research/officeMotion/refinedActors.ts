import type { ActorFrame, ActorId, Facing, Rect } from "./types";

const ROW: Record<Facing, number> = { down: 0, right: 1, left: 2, up: 3 };
const HEIGHT = 85;
const frames: Partial<
  Record<ActorId, Partial<Record<Facing, readonly number[]>>>
> = {
  company: { right: [1, 2, 1, 4], left: [1, 2, 1, 4] },
  financial: { right: [1, 2, 3, 2], left: [1, 2, 3, 2] },
  risk: { right: [1, 4, 1, 4], left: [1, 4, 1, 4] },
  company_competition: { down: [1, 2, 1, 4], up: [1, 2, 1, 4] },
  valuation: { up: [1, 2, 1, 4] },
  chair: { down: [1, 2, 1, 4], up: [1, 2, 1, 4] },
  risk_policy: { up: [1, 2, 1, 4] },
};
type Neck = { x: number; y: number };
type Atlas = {
  image: HTMLCanvasElement;
  cells: Rect[][];
  necks: Map<Rect, Neck>;
};
const atlases = new WeakMap<HTMLImageElement, Atlas>();

export function refinedAtlas(source: HTMLImageElement): Atlas {
  const cached = atlases.get(source);
  if (cached) return cached;
  const image = document.createElement("canvas");
  image.width = source.naturalWidth;
  image.height = source.naturalHeight;
  const ctx = image.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Character canvas unavailable");
  ctx.drawImage(source, 0, 0);
  const pixels = ctx.getImageData(0, 0, image.width, image.height);
  const { data } = pixels;
  const ink = (n: number) =>
    (data[n * 4 + 3] ?? 0) > 100 &&
    Math.min(
      data[n * 4] ?? 255,
      data[n * 4 + 1] ?? 255,
      data[n * 4 + 2] ?? 255,
    ) < 170;
  const boundaries = [0];
  for (let row = 1; row < 4; row++) {
    const expected = (row * image.height) / 4;
    const start = Math.floor(expected - image.height * 0.06);
    const end = Math.ceil(expected + image.height * 0.06);
    let bestStart = expected,
      bestLength = 0,
      runStart = start;
    for (let y = start; y <= end + 1; y++) {
      let occupied = y > end;
      for (let x = 0; !occupied && x < image.width; x++)
        occupied = ink(y * image.width + x);
      if (!occupied) continue;
      if (y - runStart > bestLength) {
        bestStart = runStart;
        bestLength = y - runStart;
      }
      runStart = y + 1;
    }
    boundaries.push(Math.round(bestStart + bestLength / 2));
  }
  boundaries.push(image.height);
  const cells = Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: 6 }, (_, col): Rect => {
      const x0 = Math.floor((col * image.width) / 6),
        x1 = Math.floor(((col + 1) * image.width) / 6);
      const y0 = boundaries[row] ?? 0,
        y1 = boundaries[row + 1] ?? image.height;
      let left = x1,
        top = y1,
        right = x0,
        bottom = y0;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          if (!ink(y * image.width + x)) continue;
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      if (right < left || bottom < top)
        throw new Error(`Empty character cell ${row}:${col}`);
      const x = Math.max(x0, left - 2),
        y = Math.max(y0, top - 2);
      return {
        x,
        y,
        width: Math.min(x1, right + 3) - x,
        height: Math.min(y1, bottom + 3) - y,
      };
    }),
  );
  // Mask only edge-connected backdrop; enclosed ivory clothing and documents stay opaque.
  const seen = new Uint8Array(image.width * image.height),
    queue = new Int32Array(seen.length);
  let head = 0,
    tail = 0;
  const visit = (n: number) => {
    if (n < 0 || n >= seen.length || seen[n]) return;
    seen[n] = 1;
    const k = n * 4;
    if (Math.min(data[k] ?? 0, data[k + 1] ?? 0, data[k + 2] ?? 0) < 235)
      return;
    data[k + 3] = 0;
    queue[tail++] = n;
  };
  for (let x = 0; x < image.width; x++) {
    visit(x);
    visit((image.height - 1) * image.width + x);
  }
  for (let y = 0; y < image.height; y++) {
    visit(y * image.width);
    visit(y * image.width + image.width - 1);
  }
  while (head < tail) {
    const n = queue[head++] ?? 0;
    if (n % image.width) visit(n - 1);
    if (n % image.width < image.width - 1) visit(n + 1);
    visit(n - image.width);
    visit(n + image.width);
  }
  ctx.putImageData(pixels, 0, 0);
  const necks = new Map<Rect, Neck>();
  for (const cell of cells.flat()) {
    let bestWidth = cell.width,
      neck = { x: cell.width / 2, y: cell.height * 0.43 };
    for (let y = Math.floor(cell.height * 0.36); y < cell.height * 0.51; y++) {
      let left = cell.width,
        right = 0;
      for (let x = 0; x < cell.width; x++)
        if (ink((cell.y + y) * image.width + cell.x + x)) {
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      if (right > left && right - left < bestWidth) {
        bestWidth = right - left;
        neck = { x: (left + right) / 2, y };
      }
    }
    necks.set(cell, neck);
  }
  const atlas = { image, cells, necks };
  atlases.set(source, atlas);
  return atlas;
}

function seatAmount(actor: ActorFrame): number {
  const p = Math.max(0, Math.min(1, actor.progress));
  const eased = p * p * (3 - 2 * p);
  return actor.action === "sit"
    ? eased
    : actor.action === "stand"
      ? 1 - eased
      : actor.seated
        ? 1
        : 0;
}

export function drawRefinedActor(
  ctx: CanvasRenderingContext2D,
  actor: ActorFrame,
  source: HTMLImageElement,
  time: number,
): void {
  const atlas = refinedAtlas(source),
    row = atlas.cells[ROW[actor.facing]];
  const neutral = row?.[0];
  if (!row || !neutral) return;
  const seat = seatAmount(actor),
    seated = seat > 0.5;
  const walking = actor.action === "walk";
  const phase = Math.floor(((((actor.gait / (Math.PI * 2)) % 1) + 1) % 1) * 4);
  const walkColumn =
    (frames[actor.id]?.[actor.facing] ?? [1, 2, 3, 4])[phase] ?? 1;
  const axialWalk =
    walking && (actor.facing === "up" || actor.facing === "down");
  const column = seated
    ? 5
    : axialWalk
      ? 1 + (phase % 2)
      : walking
        ? walkColumn
        : 0;
  const cell = row[column];
  if (!cell) return;
  const scale = HEIGHT / neutral.height,
    width = cell.width * scale,
    height = cell.height * scale;
  const hipRatio =
    actor.facing === "up"
      ? actor.id === "company_competition"
        ? 0.95
        : 0.82
      : 0.74;
  // All directions share the service chair's seat at y=-16; only anatomy changes, never scale.
  const top = -HEIGHT + seat * (HEIGHT - 16 - height * hipRatio);
  const side = actor.facing === "right" ? 1 : actor.facing === "left" ? -1 : 0;
  const center = seated ? side * width * 0.12 : 0;
  const draw = (rect: Rect, x: number, y: number, w: number, h: number) =>
    ctx.drawImage(
      atlas.image,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      x,
      y,
      w,
      h,
    );
  ctx.save();
  ctx.translate(actor.position.x, actor.position.y);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#19222a20";
  ctx.beginPath();
  ctx.ellipse(0, 3, 14, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  const neck = atlas.necks.get(cell);
  const headFacing = walking ? actor.facing : actor.headFacing;
  const headRow = atlas.cells[ROW[headFacing]];
  const headCell = headRow?.[seated ? 5 : 0];
  const headNeck = headCell && atlas.necks.get(headCell);
  const nod = seated
    ? Math.sin(time * 2.2 + actor.id.length) * 0.25 * actor.emphasis
    : 0;
  const moveHead = !!(
    neck &&
    headNeck &&
    headCell &&
    (headFacing !== actor.facing || nod)
  );
  const headBottom = top + (neck?.y ?? 0) * scale;
  ctx.save();
  if (moveHead) {
    ctx.beginPath();
    ctx.rect(-80, headBottom, 160, 180);
    ctx.clip();
  }
  const held =
    !walking && !seated && actor.evidence && seat === 0 ? row[1] : undefined;
  if (held) {
    const split = -HEIGHT * 0.31;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-60, split, 120, HEIGHT);
    ctx.clip();
    draw(cell, center - width / 2, top, width, height);
    ctx.restore();
    const h = held.height * scale,
      w = held.width * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-60, -HEIGHT, 120, HEIGHT * 0.69);
    ctx.clip();
    draw(held, -w / 2, -HEIGHT, w, h);
    ctx.restore();
  } else if (axialWalk) {
    const split = top + HEIGHT * 0.69;
    const upper = row[1] ?? cell;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-60, top, 120, HEIGHT * 0.69);
    ctx.clip();
    draw(
      upper,
      (-upper.width * scale) / 2,
      top,
      upper.width * scale,
      upper.height * scale,
    );
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(-60, split, 120, HEIGHT);
    ctx.clip();
    if (phase >= 2) ctx.scale(-1, 1);
    draw(cell, -width / 2, top, width, height);
    ctx.restore();
  } else draw(cell, center - width / 2, top, width, height);
  ctx.restore();
  if (moveHead && neck && headCell && headNeck) {
    const headScale = HEIGHT / (headRow?.[0]?.height ?? neutral.height);
    const targetX = center - width / 2 + neck.x * scale;
    draw(
      { ...headCell, height: headNeck.y },
      targetX - headNeck.x * headScale,
      headBottom - headNeck.y * headScale + nod,
      headCell.width * headScale,
      headNeck.y * headScale,
    );
  }
  ctx.restore();
}
