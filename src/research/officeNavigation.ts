import { buildOfficeNavigationGrid } from "./officeNavigationV7Grid";
import type { Cell } from "./officeSceneManifest";

export type NavigationEdge = {
  readonly from: Cell;
  readonly to: Cell;
};

export type NavigationGridInput = {
  readonly columns: number;
  readonly rows: number;
  readonly walkableCells: readonly Cell[];
  readonly yieldAnchors: readonly Cell[];
  readonly blockedEdges?: readonly NavigationEdge[];
};

export type NavigationGrid = {
  readonly columns: number;
  readonly rows: number;
  readonly walkableCells: readonly Cell[];
  readonly yieldAnchors: readonly Cell[];
  readonly blockedEdges: readonly NavigationEdge[];
};

export type RouteRequest = {
  readonly from: Cell;
  readonly to: Cell;
  readonly blockedCells: readonly Cell[];
};

export type RouteResult =
  | { readonly kind: "found"; readonly path: readonly Cell[] }
  | { readonly kind: "unreachable"; readonly from: Cell; readonly to: Cell };

type SearchNode = {
  readonly cell: Cell;
  readonly cost: number;
  readonly heuristic: number;
};

const CARDINAL_OFFSETS = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
] as const;

export function officeCellKey(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}

function compareCells(left: Cell, right: Cell): number {
  return left.y - right.y || left.x - right.x;
}

function edgeKey(from: Cell, to: Cell): string {
  const fromKey = officeCellKey(from);
  const toKey = officeCellKey(to);
  return fromKey < toKey ? `${fromKey}|${toKey}` : `${toKey}|${fromKey}`;
}

export function createNavigationGrid(
  input: NavigationGridInput,
): NavigationGrid {
  const uniqueCells = new Map<string, Cell>();
  for (const current of input.walkableCells) {
    uniqueCells.set(officeCellKey(current), Object.freeze({ ...current }));
  }
  const uniqueEdges = new Map<string, NavigationEdge>();
  for (const edge of input.blockedEdges ?? []) {
    uniqueEdges.set(
      edgeKey(edge.from, edge.to),
      Object.freeze({
        from: Object.freeze({ ...edge.from }),
        to: Object.freeze({ ...edge.to }),
      }),
    );
  }
  return Object.freeze({
    columns: input.columns,
    rows: input.rows,
    walkableCells: Object.freeze([...uniqueCells.values()].sort(compareCells)),
    yieldAnchors: Object.freeze(
      input.yieldAnchors
        .map((cell) => Object.freeze({ ...cell }))
        .sort(compareCells),
    ),
    blockedEdges: Object.freeze([...uniqueEdges.values()]),
  });
}

export function isOfficeCellWalkable(
  grid: NavigationGrid,
  cell: Cell,
): boolean {
  const key = officeCellKey(cell);
  return grid.walkableCells.some(
    (candidate) => officeCellKey(candidate) === key,
  );
}

function neighbors(
  cell: Cell,
  walkable: ReadonlySet<string>,
  blockedEdges: ReadonlySet<string>,
): readonly Cell[] {
  return CARDINAL_OFFSETS.map((offset) => ({
    x: cell.x + offset.x,
    y: cell.y + offset.y,
  })).filter(
    (candidate) =>
      walkable.has(officeCellKey(candidate)) &&
      !blockedEdges.has(edgeKey(cell, candidate)),
  );
}

function compareNodes(left: SearchNode, right: SearchNode): number {
  const leftTotal = left.cost + left.heuristic;
  const rightTotal = right.cost + right.heuristic;
  return (
    leftTotal - rightTotal ||
    left.heuristic - right.heuristic ||
    compareCells(left.cell, right.cell)
  );
}

function manhattan(from: Cell, to: Cell): number {
  return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
}

export function findOfficeRoute(
  grid: NavigationGrid,
  request: RouteRequest,
): RouteResult {
  const walkable = new Set(grid.walkableCells.map(officeCellKey));
  const blockedEdges = new Set(
    grid.blockedEdges.map((edge) => edgeKey(edge.from, edge.to)),
  );
  const blocked = new Set(request.blockedCells.map(officeCellKey));
  const startKey = officeCellKey(request.from);
  const targetKey = officeCellKey(request.to);
  if (
    !walkable.has(startKey) ||
    !walkable.has(targetKey) ||
    blocked.has(targetKey)
  ) {
    return { kind: "unreachable", from: request.from, to: request.to };
  }
  const open: SearchNode[] = [
    {
      cell: request.from,
      cost: 0,
      heuristic: manhattan(request.from, request.to),
    },
  ];
  const costs = new Map<string, number>([[startKey, 0]]);
  const previous = new Map<string, Cell>();
  const closed = new Set<string>();
  while (open.length > 0) {
    open.sort(compareNodes);
    const current = open.shift();
    if (!current) break;
    const currentKey = officeCellKey(current.cell);
    if (currentKey === targetKey) {
      const path: Cell[] = [request.to];
      let cursor = request.to;
      while (officeCellKey(cursor) !== startKey) {
        const parent = previous.get(officeCellKey(cursor));
        if (!parent) {
          return { kind: "unreachable", from: request.from, to: request.to };
        }
        path.push(parent);
        cursor = parent;
      }
      return { kind: "found", path: Object.freeze(path.reverse()) };
    }
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);
    for (const next of neighbors(current.cell, walkable, blockedEdges)) {
      const nextKey = officeCellKey(next);
      if (blocked.has(nextKey) && nextKey !== startKey) continue;
      const nextCost = current.cost + 1;
      const priorCost = costs.get(nextKey);
      if (priorCost !== undefined && priorCost <= nextCost) continue;
      costs.set(nextKey, nextCost);
      previous.set(nextKey, current.cell);
      open.push({
        cell: next,
        cost: nextCost,
        heuristic: manhattan(next, request.to),
      });
    }
  }
  return { kind: "unreachable", from: request.from, to: request.to };
}

export function findOfficeRouteVia(
  grid: NavigationGrid,
  request: RouteRequest,
  waypoints: readonly Cell[],
): RouteResult {
  const targets = [...waypoints, request.to].filter(
    (target, index, values) =>
      officeCellKey(target) !== officeCellKey(request.from) &&
      (index === 0 ||
        officeCellKey(target) !== officeCellKey(values[index - 1] ?? target)),
  );
  const path: Cell[] = [request.from];
  let cursor = request.from;
  for (const target of targets) {
    const targetKey = officeCellKey(target);
    const segment = findOfficeRoute(grid, {
      from: cursor,
      to: target,
      // A doorway is a route contract, not a permanent obstacle. Runtime
      // traffic reservations still serialize agents that reach it together.
      blockedCells: request.blockedCells.filter(
        (cell) => officeCellKey(cell) !== targetKey,
      ),
    });
    if (segment.kind === "unreachable") {
      return { kind: "unreachable", from: request.from, to: request.to };
    }
    path.push(...segment.path.slice(1));
    cursor = target;
  }
  return { kind: "found", path: Object.freeze(path) };
}

export function findYieldRoute(
  grid: NavigationGrid,
  request: RouteRequest,
): RouteResult {
  const candidates = [...grid.yieldAnchors]
    .filter(
      (anchor) =>
        officeCellKey(anchor) !== officeCellKey(request.from) &&
        officeCellKey(anchor) !== officeCellKey(request.to),
    )
    .sort(
      (left, right) =>
        manhattan(request.from, left) - manhattan(request.from, right) ||
        compareCells(left, right),
    );
  for (const anchor of candidates) {
    const route = findOfficeRoute(grid, { ...request, to: anchor });
    if (route.kind === "found") return route;
  }
  return { kind: "unreachable", from: request.from, to: request.to };
}

export const OFFICE_NAVIGATION_GRID =
  buildOfficeNavigationGrid(createNavigationGrid);
