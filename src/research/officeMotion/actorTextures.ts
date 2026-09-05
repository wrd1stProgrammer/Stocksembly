import type { Facing } from "./types";

const ROW: Record<Facing, number> = { down: 0, right: 1, left: 2, up: 3 };
export function surface(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
function magenta(r: number, g: number, b: number): boolean {
  return r > g + 28 && b > g + 18 && r > 60 && b > 50;
}

export function cleanSheet(source: HTMLImageElement): HTMLCanvasElement {
  const result = surface(source.width, source.height);
  const ctx = result.getContext("2d");
  if (!ctx) throw new TypeError("Canvas2D is unavailable");
  ctx.drawImage(source, 0, 0);
  const pixels = ctx.getImageData(0, 0, result.width, result.height);
  const original = new Uint8ClampedArray(pixels.data);
  const { width, height } = pixels;
  for (let y = 2; y < height - 2; y++)
    for (let x = 2; x < width - 2; x++) {
      const i = (y * width + x) * 4;
      if (
        !original[i + 3] ||
        !magenta(original[i] ?? 0, original[i + 1] ?? 0, original[i + 2] ?? 0)
      )
        continue;
      let boundary = false;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          if ((original[((y + dy) * width + x + dx) * 4 + 3] ?? 0) < 64)
            boundary = true;
      if (!boundary && source.src.endsWith("/chair.png")) continue;
      let nearest = -1;
      let score = Infinity;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx,
            yy = y + dy;
          if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue;
          const n = (yy * width + xx) * 4;
          if (
            (original[n + 3] ?? 0) < 180 ||
            magenta(
              original[n] ?? 0,
              original[n + 1] ?? 0,
              original[n + 2] ?? 0,
            )
          )
            continue;
          const distance = dx * dx + dy * dy;
          if (distance < score) {
            score = distance;
            nearest = n;
          }
        }
      if (nearest < 0) pixels.data[i + 3] = 0;
      else
        for (let channel = 0; channel < 3; channel++)
          pixels.data[i + channel] = original[nearest + channel] ?? 0;
    }
  ctx.putImageData(pixels, 0, 0);
  const copy = surface(result.width, result.height);
  copy.getContext("2d")?.drawImage(result, 0, 0);
  const mirror = (from: Facing, column: number, to: Facing): void => {
    ctx.clearRect(column * 160, ROW[to] * 192, 160, 192);
    ctx.save();
    ctx.translate(column * 160 + 160, ROW[to] * 192);
    ctx.scale(-1, 1);
    ctx.drawImage(
      copy,
      column * 160,
      ROW[from] * 192,
      160,
      192,
      0,
      0,
      160,
      192,
    );
    ctx.restore();
  };
  if (source.src.endsWith("/financial.png")) {
    mirror("right", 1, "left");
    mirror("right", 2, "left");
    ctx.clearRect(480, 192, 160, 192);
    ctx.drawImage(copy, 480, 384, 160, 192, 480, 192, 160, 192);
    ctx.clearRect(480, 384, 160, 192);
    ctx.drawImage(copy, 480, 192, 160, 192, 480, 384, 160, 192);
  }
  if (source.src.endsWith("/risk_policy.png")) mirror("right", 3, "left");
  return result;
}

export function legLayer(
  sheet: HTMLCanvasElement,
  id: string,
  facing: Facing,
  column: number,
  seated = false,
): HTMLCanvasElement {
  const top = seated ? 146 : 137;
  const result = surface(160, 176 - top);
  const ctx = result.getContext("2d");
  if (!ctx) throw new TypeError("Canvas2D is unavailable");
  ctx.drawImage(
    sheet,
    column * 160,
    ROW[facing] * 192 + top,
    160,
    result.height,
    0,
    0,
    160,
    result.height,
  );
  if (!seated) {
    const side = facing === "right" || facing === "left";
    const financial = id === "financial";
    if (side && column > 0) {
      if (id === "risk" && facing === "left") ctx.clearRect(100, 0, 60, 4);
      if (id === "chair") {
        [65, 65, 65, 64, 62].forEach((edge, row) => {
          if (facing === "right") ctx.clearRect(0, row, edge, 1);
          else ctx.clearRect(95 + row, row, 65 - row, 1);
        });
      }
      if (financial || id === "benchmark") {
        const nearEdge = financial
          ? [71, 70, 68, 66, 64, 63]
          : [70, 67, 64, 62];
        nearEdge.forEach((edge, row) => {
          if (facing === "right") ctx.clearRect(0, row, edge, 1);
          else ctx.clearRect(160 - edge, row, edge, 1);
        });
      }
    } else if (side) {
      // The idle hand overlaps the thigh in these source cells. Reuse the
      // uncovered trouser pixels immediately below it, before extracting legs.
      const repairRows: Readonly<Record<string, number>> = {
        market: 4,
        benchmark: 6,
        company: 5,
        company_competition: 4,
        financial: 13,
        risk: 9,
        risk_policy: 7,
      };
      const rows = repairRows[id] ?? 0;
      if (rows) {
        ctx.clearRect(0, 0, 160, rows);
        ctx.drawImage(
          sheet,
          0,
          ROW[facing] * 192 + top + rows,
          160,
          rows,
          0,
          0,
          160,
          rows,
        );
      }
    } else {
      const end = financial && facing === "up" ? 149 : 148;
      const left = financial ? 62 : 64,
        right = financial ? 100 : 98;
      ctx.clearRect(0, 0, left, end - top);
      ctx.clearRect(right, 0, 160 - right, end - top);
    }
  }
  // Small original hand fragments must not survive as islands beside the legs.
  const pixels = ctx.getImageData(0, 0, 160, result.height);
  const visited = new Uint8Array(160 * result.height);
  for (let start = 0; start < visited.length; start++) {
    if (visited[start] || (pixels.data[start * 4 + 3] ?? 0) < 12) continue;
    const queue = [start];
    visited[start] = 1;
    let connectedToLeg = false;
    for (let next = 0; next < queue.length; next++) {
      const p = queue[next];
      if (p === undefined) continue;
      const x = p % 160,
        y = Math.floor(p / 160);
      if (y >= result.height - 16) connectedToLeg = true;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx,
            yy = y + dy;
          if (xx < 0 || xx >= 160 || yy < 0 || yy >= result.height) continue;
          const n = yy * 160 + xx;
          if (!visited[n] && (pixels.data[n * 4 + 3] ?? 0) >= 12) {
            visited[n] = 1;
            queue.push(n);
          }
        }
    }
    if (!connectedToLeg) for (const p of queue) pixels.data[p * 4 + 3] = 0;
  }
  ctx.putImageData(pixels, 0, 0);
  return result;
}
