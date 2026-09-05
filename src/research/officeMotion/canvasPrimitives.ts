import type { Assets } from "./types";

export function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
  stroke?: string,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

export function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function line(
  ctx: CanvasRenderingContext2D,
  points: readonly (readonly [number, number])[],
  color: string,
  width = 1,
): void {
  ctx.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

export function text(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  size: number,
  color: string,
  weight = 500,
): void {
  ctx.font = `${weight} ${size}px Pretendard, sans-serif`;
  ctx.fillStyle = color;
  ctx.fillText(label, x, y);
}

export function asset(assets: Assets, id: string): HTMLImageElement {
  const image = assets.get(id);
  if (!image) throw new RangeError(`Missing office asset: ${id}`);
  return image;
}

export const OFFICE_ASSET_PATHS: Readonly<Record<string, string>> = {
  office: "/research/office-v8/base.png",
  desk: "/research/office-v9/entities/workstation-single-table.png",
  "chair-up": "/research/office-v9/entities/analyst-chair-up.png",
  "chair-down": "/research/office-v9/entities/analyst-chair-down.png",
  market: "/research/office-v9/agents/market.png",
  market_news: "/research/office-v9/agents/market_news.png",
  benchmark: "/research/office-v9/agents/benchmark.png",
  company: "/research/office-v9/agents/company.png",
  company_product: "/research/office-v9/agents/company_product.png",
  company_competition: "/research/office-v9/agents/company_competition.png",
  financial: "/research/office-v9/agents/financial.png",
  valuation: "/research/office-v9/agents/valuation.png",
  financial_quality: "/research/office-v9/agents/financial_quality.png",
  risk: "/research/office-v9/agents/risk.png",
  risk_policy: "/research/office-v9/agents/risk_policy.png",
  chair: "/research/office-v9/agents/chair.png",
};

export async function loadAssets(
  ids: readonly string[] = Object.keys(OFFICE_ASSET_PATHS),
): Promise<Assets> {
  const entries = await Promise.all(
    ids.map(async (id) => {
      const path = OFFICE_ASSET_PATHS[id];
      if (!path) throw new RangeError(`Unknown office asset: ${id}`);
      const image = new Image();
      image.src = path;
      await image.decode();
      return [id, image] as const;
    }),
  );
  return new Map(entries);
}
