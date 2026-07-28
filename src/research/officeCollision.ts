import type { Point } from "./officeGameConfig";

export type CollisionRect = {
  readonly id: string;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

export const OFFICE_OBSTACLES: readonly CollisionRect[] = [
  { id: "market-desk", left: 65, top: 45, right: 610, bottom: 265 },
  { id: "company-desk", left: 815, top: 45, right: 1265, bottom: 265 },
  { id: "financial-desk", left: 40, top: 310, right: 225, bottom: 680 },
  { id: "valuation-desk", left: 1210, top: 310, right: 1408, bottom: 680 },
  { id: "risk-desk", left: 190, top: 805, right: 585, bottom: 1020 },
  { id: "chair-desk", left: 840, top: 805, right: 1265, bottom: 1020 },
] as const;

function between(value: number, start: number, end: number): boolean {
  return value > Math.min(start, end) && value < Math.max(start, end);
}

export function segmentCrossesRect(
  from: Point,
  to: Point,
  rect: CollisionRect,
): boolean {
  if (from.x === to.x) {
    return (
      from.x > rect.left &&
      from.x < rect.right &&
      Math.max(from.y, to.y) > rect.top &&
      Math.min(from.y, to.y) < rect.bottom
    );
  }
  if (from.y === to.y) {
    return (
      from.y > rect.top &&
      from.y < rect.bottom &&
      Math.max(from.x, to.x) > rect.left &&
      Math.min(from.x, to.x) < rect.right
    );
  }
  return between(rect.left, from.x, to.x) || between(rect.top, from.y, to.y);
}

export function routeCollisions(points: readonly Point[]): string[] {
  const collisions = new Set<string>();
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (!from || !to) continue;
    for (const obstacle of OFFICE_OBSTACLES) {
      if (segmentCrossesRect(from, to, obstacle)) collisions.add(obstacle.id);
    }
  }
  return [...collisions];
}
