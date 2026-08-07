import type {
  NavigationEdge,
  NavigationGrid,
  NavigationGridInput,
} from "./officeNavigation";
import type { Cell, CellRect } from "./officeSceneManifest";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";

type GridFactory = (input: NavigationGridInput) => NavigationGrid;

const OFFSETS = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
] as const;

function key(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}

function edgeKey(from: Cell, to: Cell): string {
  const fromKey = key(from);
  const toKey = key(to);
  return fromKey < toKey ? `${fromKey}|${toKey}` : `${toKey}|${fromKey}`;
}

function contains(rect: CellRect, cell: Cell): boolean {
  return (
    cell.x >= rect.min.x &&
    cell.x <= rect.max.x &&
    cell.y >= rect.min.y &&
    cell.y <= rect.max.y
  );
}

function inset(rect: CellRect): CellRect {
  return {
    min: { x: rect.min.x + 1, y: rect.min.y + 1 },
    max: { x: rect.max.x - 1, y: rect.max.y - 1 },
  };
}

export function buildOfficeNavigationGrid(
  createGrid: GridFactory,
): NavigationGrid {
  const rooms = Object.values(OFFICE_SCENE_MANIFEST.rooms);
  const blocked = new Set([
    ...OFFICE_SCENE_MANIFEST.world.blockedCells.map(key),
    ...OFFICE_SCENE_MANIFEST.furniture.flatMap(({ footprint }) => {
      const cells: string[] = [];
      for (let y = footprint.min.y; y <= footprint.max.y; y += 1) {
        for (let x = footprint.min.x; x <= footprint.max.x; x += 1) {
          cells.push(key({ x, y }));
        }
      }
      return cells;
    }),
  ]);
  const walkableCells: Cell[] = [];
  for (let y = 0; y < OFFICE_SCENE_MANIFEST.world.rows; y += 1) {
    for (let x = 0; x < OFFICE_SCENE_MANIFEST.world.columns; x += 1) {
      const current = { x, y };
      const insideRoom = rooms.some(
        ({ bounds, doors }) =>
          contains(inset(bounds), current) ||
          doors.some((door) => key(door) === key(current)),
      );
      const insideCorridor = OFFICE_SCENE_MANIFEST.world.corridorBands.some(
        (area) => contains(area, current),
      );
      if ((insideRoom || insideCorridor) && !blocked.has(key(current)))
        walkableCells.push(current);
    }
  }
  const blockedEdges: NavigationEdge[] = [];
  for (const from of walkableCells) {
    for (const offset of OFFSETS) {
      const to = { x: from.x + offset.x, y: from.y + offset.y };
      for (const { bounds, doors } of rooms) {
        const fromInside = contains(bounds, from);
        const toInside = contains(bounds, to);
        const inside = fromInside ? from : to;
        const isDoor = doors.some((door) => key(door) === key(inside));
        if (fromInside !== toInside && !isDoor) {
          blockedEdges.push({ from, to });
        }
      }
    }
  }
  const base = createGrid({
    columns: OFFICE_SCENE_MANIFEST.world.columns,
    rows: OFFICE_SCENE_MANIFEST.world.rows,
    walkableCells,
    yieldAnchors: [],
    blockedEdges,
  });
  const semanticCells = new Set([
    ...OFFICE_SCENE_MANIFEST.roster.map((member) => key(member.seat.cell)),
    ...Object.values(OFFICE_SCENE_MANIFEST.departments).flatMap(
      (department) => [
        ...department.talkAnchors.map((anchor) => key(anchor.cell)),
        key(department.visitorAnchor.cell),
      ],
    ),
    ...Object.values(OFFICE_SCENE_MANIFEST.forum.anchors).map((anchor) =>
      key(anchor.cell),
    ),
  ]);
  const walkable = new Set(base.walkableCells.map(key));
  const edges = new Set(
    base.blockedEdges.map((edge) => edgeKey(edge.from, edge.to)),
  );
  const yieldAnchors = base.walkableCells.filter((current) => {
    const inCorridor = OFFICE_SCENE_MANIFEST.world.corridorBands.some((band) =>
      contains(band, current),
    );
    const degree = OFFSETS.filter((offset) => {
      const next = { x: current.x + offset.x, y: current.y + offset.y };
      return walkable.has(key(next)) && !edges.has(edgeKey(current, next));
    }).length;
    return inCorridor && !semanticCells.has(key(current)) && degree >= 3;
  });
  return createGrid({ ...base, yieldAnchors });
}
