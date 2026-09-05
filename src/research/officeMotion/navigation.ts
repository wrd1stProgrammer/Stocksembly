import { FORUM_PLACES, ROSTER, TEAM_TABLES, WALLS, WORLD } from "./layout";
import type { Point, Rect } from "./types";

export const FOOT_RADIUS = 14;
const GRID_STEP = 8;
const COLUMNS = Math.ceil(WORLD.width / GRID_STEP);
const ROWS = Math.ceil(WORLD.height / GRID_STEP);
const forumTable = { center: { x: 744, y: 452 }, radiusX: 114, radiusY: 48 };
const desks = ROSTER.map((member) => ({
  x: member.seat.x - 59,
  y: member.seat.y - 12,
  width: 118,
  height: 56,
}));
const chairs = [
  ...TEAM_TABLES.flatMap((table) => table.seats),
  ...Object.values(FORUM_PLACES),
];
const walls: readonly Rect[] = [
  ...WALLS,
  { x: 16, y: 640, width: 598, height: 112 },
  { x: 742, y: 640, width: 615, height: 112 },
];
let floorGrid: Uint8Array | undefined;
const nearestCache = new Map<string, Point>();

function rectangleDistance(point: Point, rect: Rect): number {
  return Math.hypot(
    point.x - Math.max(rect.x, Math.min(point.x, rect.x + rect.width)),
    point.y - Math.max(rect.y, Math.min(point.y, rect.y + rect.height)),
  );
}

function ellipseDistance(point: Point, table: typeof forumTable): number {
  const x = Math.abs(point.x - table.center.x);
  const y = Math.abs(point.y - table.center.y);
  const rx = table.radiusX;
  const ry = table.radiusY;
  if (x > rx + FOOT_RADIUS || y > ry + FOOT_RADIUS) return FOOT_RADIUS + 1;
  if ((x / rx) ** 2 + (y / ry) ** 2 <= 1) return 0;
  let low = 0;
  let high = Math.hypot(rx * x, ry * y);
  for (let index = 0; index < 18; index += 1) {
    const mid = (low + high) / 2;
    if (
      ((rx * x) / (mid + rx ** 2)) ** 2 + ((ry * y) / (mid + ry ** 2)) ** 2 >
      1
    )
      low = mid;
    else high = mid;
  }
  return Math.hypot(
    x - (rx ** 2 * x) / (high + rx ** 2),
    y - (ry ** 2 * y) / (high + ry ** 2),
  );
}

export function isFloorPoint(
  point: Point,
  people: readonly Point[] = [],
): boolean {
  if (
    point.x < 32 ||
    point.x > WORLD.width - 30 ||
    point.y < 224 ||
    point.y > WORLD.height - 20
  )
    return false;
  if (walls.some((rect) => rectangleDistance(point, rect) < FOOT_RADIUS))
    return false;
  if (desks.some((rect) => rectangleDistance(point, rect) < FOOT_RADIUS))
    return false;
  if (
    [...TEAM_TABLES, forumTable].some(
      (table) => ellipseDistance(point, table) < FOOT_RADIUS,
    )
  )
    return false;
  // Keep clearance around the chair pedestal; the raised back and caster spokes
  // are depth-sorted rather than treated as a solid disc across the aisle.
  if (
    chairs.some(
      (chair) =>
        Math.hypot(point.x - chair.position.x, point.y - chair.position.y) <
        12 + FOOT_RADIUS,
    )
  )
    return false;
  return !people.some(
    (other) =>
      Math.hypot(point.x - other.x, point.y - other.y) < FOOT_RADIUS * 2,
  );
}

export function clearFloorSegment(
  from: Point,
  to: Point,
  people: readonly Point[] = [],
): boolean {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(length / 3));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    if (
      !isFloorPoint(
        { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t },
        people,
      )
    )
      return false;
  }
  return true;
}

function pointAt(index: number): Point {
  return {
    x: (index % COLUMNS) * GRID_STEP,
    y: Math.floor(index / COLUMNS) * GRID_STEP,
  };
}

function grid(): Uint8Array {
  if (floorGrid) return floorGrid;
  floorGrid = new Uint8Array(COLUMNS * ROWS);
  for (let index = 0; index < floorGrid.length; index += 1)
    floorGrid[index] = isFloorPoint(pointAt(index)) ? 1 : 0;
  return floorGrid;
}

function nearestIndex(point: Point, people: readonly Point[] = []): number {
  const floor = grid();
  let nearest = -1;
  let distance = Infinity;
  for (let index = 0; index < floor.length; index += 1) {
    if (!floor[index]) continue;
    const candidate = pointAt(index);
    const nextDistance =
      (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
    if (
      nextDistance >= distance ||
      people.some(
        (other) =>
          Math.hypot(candidate.x - other.x, candidate.y - other.y) <
          FOOT_RADIUS * 2,
      )
    )
      continue;
    distance = nextDistance;
    nearest = index;
  }
  return nearest;
}

export function nearestFloorPoint(point: Point): Point {
  const key = `${point.x}:${point.y}`;
  const cached = nearestCache.get(key);
  if (cached) return cached;
  if (isFloorPoint(point)) return point;
  const index = nearestIndex(point);
  const nearest = index < 0 ? point : pointAt(index);
  nearestCache.set(key, nearest);
  return nearest;
}

type Node = { readonly index: number; readonly score: number };
function push(heap: Node[], node: Node): void {
  heap.push(node);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    const before = heap[parent];
    if (!before || before.score <= node.score) break;
    heap[index] = before;
    index = parent;
  }
  heap[index] = node;
}
function pop(heap: Node[]): Node | undefined {
  const first = heap[0];
  const last = heap.pop();
  if (!last || heap.length === 0) return first;
  let index = 0;
  while (index * 2 + 1 < heap.length) {
    let child = index * 2 + 1;
    const right = heap[child + 1];
    const left = heap[child];
    if (right && left && right.score < left.score) child += 1;
    const next = heap[child];
    if (!next || next.score >= last.score) break;
    heap[index] = next;
    index = child;
  }
  heap[index] = last;
  return first;
}

export function findMotionRoute(
  from: Point,
  to: Point,
  people: readonly Point[] = [],
): readonly Point[] {
  if (clearFloorSegment(from, to, people)) return [from, to];
  const floor = grid();
  const start = nearestIndex(from);
  const target = nearestIndex(to, people);
  if (start < 0 || target < 0) return [];
  const startPoint = pointAt(start);
  const targetPoint = pointAt(target);
  // A failed access connection must never fall back to walking through furniture.
  if (
    !clearFloorSegment(from, startPoint) ||
    !clearFloorSegment(targetPoint, to, people)
  )
    return [];
  const distance = new Float64Array(floor.length).fill(Infinity);
  const previous = new Int32Array(floor.length).fill(-1);
  const closed = new Uint8Array(floor.length);
  const heap: Node[] = [];
  const heuristic = (index: number): number => {
    const point = pointAt(index);
    return (
      Math.abs(point.x - targetPoint.x) + Math.abs(point.y - targetPoint.y)
    );
  };
  distance[start] = 0;
  push(heap, { index: start, score: heuristic(start) });
  while (heap.length > 0) {
    const node = pop(heap);
    if (!node) break;
    const current = node.index;
    if (closed[current]) continue;
    if (current === target) {
      const path: Point[] = [to, targetPoint];
      let cursor = target;
      while (cursor !== start) {
        cursor = previous[cursor] ?? -1;
        if (cursor < 0) return [];
        path.push(pointAt(cursor));
      }
      path.push(from);
      path.reverse();
      const smooth: Point[] = [from];
      let index = 0;
      while (index < path.length - 1) {
        let next = path.length - 1;
        while (
          next > index + 1 &&
          !clearFloorSegment(path[index] ?? from, path[next] ?? to, people)
        )
          next -= 1;
        smooth.push(path[next] ?? to);
        index = next;
      }
      return smooth;
    }
    closed[current] = 1;
    const currentPoint = pointAt(current);
    for (const offset of [-COLUMNS, -1, 1, COLUMNS]) {
      const next = current + offset;
      if (!floor[next] || closed[next]) continue;
      const nextPoint = pointAt(next);
      if (
        Math.abs(nextPoint.x - currentPoint.x) +
          Math.abs(nextPoint.y - currentPoint.y) !==
        GRID_STEP
      )
        continue;
      if (
        people.length > 0 &&
        people.some(
          (other) =>
            Math.hypot(nextPoint.x - other.x, nextPoint.y - other.y) <
            FOOT_RADIUS * 2,
        )
      )
        continue;
      if (!clearFloorSegment(currentPoint, nextPoint)) continue;
      const cost = (distance[current] ?? Infinity) + GRID_STEP;
      if (cost >= (distance[next] ?? Infinity)) continue;
      distance[next] = cost;
      previous[next] = current;
      push(heap, { index: next, score: cost + heuristic(next) });
    }
  }
  return [];
}
