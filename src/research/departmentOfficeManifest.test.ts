import { describe, expect, it } from "vitest";
import {
  AGENT_IDS,
  OFFICE_SCENE_MANIFEST,
  validateOfficeSceneManifest,
} from "./officeSceneManifest";

function contractManifest(): typeof OFFICE_SCENE_MANIFEST {
  return OFFICE_SCENE_MANIFEST;
}

const expectedSeats = {
  market: [{ x: 8, y: 7 }, { x: 8, y: 8 }, "down"],
  market_news: [{ x: 7, y: 11 }, { x: 7, y: 10 }, "up"],
  benchmark: [{ x: 9, y: 11 }, { x: 9, y: 10 }, "up"],
  company: [{ x: 35, y: 7 }, { x: 35, y: 8 }, "down"],
  company_product: [{ x: 34, y: 11 }, { x: 34, y: 10 }, "up"],
  company_competition: [{ x: 37, y: 11 }, { x: 37, y: 10 }, "up"],
  financial: [{ x: 7, y: 24 }, { x: 7, y: 25 }, "down"],
  valuation: [{ x: 11, y: 24 }, { x: 11, y: 25 }, "down"],
  financial_quality: [{ x: 9, y: 28 }, { x: 9, y: 27 }, "up"],
  risk: [{ x: 31, y: 24 }, { x: 31, y: 25 }, "down"],
  risk_policy: [{ x: 34, y: 28 }, { x: 34, y: 27 }, "up"],
  chair: [{ x: 22, y: 11 }, { x: 22, y: 10 }, "up"],
} as const;

describe("department office manifest", () => {
  it("locks the approved 3/3/3/2 roster and representatives", () => {
    // Given
    const manifest = contractManifest();
    // When
    const counts = Object.fromEntries(
      Object.entries(manifest.departments).map(([id, department]) => [
        id,
        department.memberIds.length,
      ]),
    );
    const representatives = Object.values(manifest.departments).map(
      (department) => department.representativeId,
    );
    // Then
    expect(counts).toEqual({ market: 3, company: 3, financial: 3, risk: 2 });
    expect(new Set(AGENT_IDS).size).toBe(12);
    expect(manifest.roster.map((member) => member.id)).toEqual(AGENT_IDS);
    expect(representatives).toEqual(["market", "company", "financial", "risk"]);
  });

  it("locks the 1374 by 1145 world, rooms, doors, and corridor band", () => {
    // Given
    const manifest = contractManifest();
    // When
    const rooms = Object.fromEntries(
      Object.entries(manifest.departments).map(([id, value]) => [
        id,
        value.room,
      ]),
    );
    const doors = Object.fromEntries(
      Object.entries(manifest.departments).map(([id, value]) => [
        id,
        value.door,
      ]),
    );
    // Then
    expect(manifest.world).toMatchObject({
      width: 1374,
      height: 1145,
      cellSize: 32,
      columns: 43,
      rows: 35,
    });
    expect(rooms).toEqual({
      market: { min: { x: 1, y: 1 }, max: { x: 16, y: 16 } },
      company: { min: { x: 29, y: 1 }, max: { x: 41, y: 16 } },
      financial: { min: { x: 1, y: 17 }, max: { x: 19, y: 33 } },
      risk: { min: { x: 23, y: 17 }, max: { x: 41, y: 33 } },
    });
    expect(manifest.chairOffice.room).toEqual({
      min: { x: 17, y: 1 },
      max: { x: 28, y: 16 },
    });
    expect(manifest.forum.room).toEqual({
      min: { x: 18, y: 10 },
      max: { x: 27, y: 16 },
    });
    expect(doors).toEqual({
      market: { x: 16, y: 10 },
      company: { x: 29, y: 10 },
      financial: { x: 19, y: 24 },
      risk: { x: 23, y: 24 },
    });
    expect(manifest.chairOffice.door).toEqual({ x: 21, y: 16 });
    expect(manifest.world.corridorBands).toEqual([
      { min: { x: 20, y: 15 }, max: { x: 22, y: 33 } },
    ]);
  });

  it("locks every seat, input cell, and work facing", () => {
    // Given
    const manifest = contractManifest();
    // When
    const seats = Object.fromEntries(
      manifest.roster.map((member) => [
        member.id,
        [member.seat.cell, member.seat.inputCell, member.seat.facing],
      ]),
    );
    // Then
    expect(seats).toEqual(expectedSeats);
    expect(
      manifest.roster.every(
        ({ seat }) =>
          (seat.facing === "up" || seat.facing === "down") &&
          seat.cell.x === seat.inputCell.x,
      ),
    ).toBe(true);
  });

  it("keeps varied department tables below wall displays and near room centers", () => {
    // Given
    const manifest = contractManifest();
    // When
    const footprints = Object.fromEntries(
      manifest.furniture.map((item) => [item.id, item.footprint]),
    );
    // Then
    expect(footprints).toEqual({
      "market-table": { min: { x: 5, y: 8 }, max: { x: 11, y: 10 } },
      "chair-desk": { min: { x: 20, y: 8 }, max: { x: 25, y: 10 } },
      "company-table": { min: { x: 32, y: 8 }, max: { x: 38, y: 10 } },
      "financial-table": { min: { x: 6, y: 25 }, max: { x: 12, y: 27 } },
      "risk-table": { min: { x: 30, y: 25 }, max: { x: 35, y: 27 } },
    });
    expect(
      new Set(manifest.furniture.map((item) => item.footprint.min.x)).size,
    ).toBe(5);
  });

  it("locks department talk and visitor anchors", () => {
    // Given
    const manifest = contractManifest();
    // When
    const talk = Object.fromEntries(
      Object.entries(manifest.departments).map(([id, department]) => [
        id,
        department.talkAnchors.map(({ cell, facing }) => [cell, facing]),
      ]),
    );
    const visitors = Object.fromEntries(
      Object.entries(manifest.departments).map(([id, department]) => [
        id,
        department.visitorAnchor,
      ]),
    );
    // Then
    expect(talk).toEqual({
      market: [
        [{ x: 14, y: 10 }, "left"],
        [{ x: 12, y: 10 }, "right"],
        [{ x: 11, y: 12 }, "up"],
      ],
      company: [
        [{ x: 31, y: 10 }, "right"],
        [{ x: 33, y: 12 }, "left"],
        [{ x: 34, y: 14 }, "up"],
      ],
      financial: [
        [{ x: 17, y: 24 }, "left"],
        [{ x: 15, y: 24 }, "right"],
        [{ x: 15, y: 26 }, "up"],
      ],
      risk: [
        [{ x: 25, y: 24 }, "right"],
        [{ x: 27, y: 24 }, "left"],
      ],
    });
    expect(visitors).toEqual({
      market: { cell: { x: 15, y: 10 }, facing: "left" },
      company: { cell: { x: 30, y: 10 }, facing: "right" },
      financial: { cell: { x: 18, y: 24 }, facing: "left" },
      risk: { cell: { x: 24, y: 24 }, facing: "right" },
    });
  });

  it("locks inward-facing forum anchors and the five-forum seven-home split", () => {
    // Given
    const manifest = contractManifest();
    // When
    const forum = Object.fromEntries(
      Object.entries(manifest.forum.anchors).map(([id, anchor]) => [
        id,
        [anchor.cell, anchor.facing, anchor.target],
      ]),
    );
    const forumMembers = manifest.roster.filter(
      (member) => member.finalLocation === "forum",
    );
    const departmentMembers = manifest.roster.filter(
      (member) => member.finalLocation === "department",
    );
    // Then
    expect(manifest.forum.target).toEqual({ x: 22, y: 14 });
    expect(forum).toEqual({
      market: [{ x: 19, y: 13 }, "right", { x: 22, y: 14 }],
      company: [{ x: 25, y: 13 }, "left", { x: 22, y: 14 }],
      financial: [{ x: 20, y: 15 }, "up", { x: 22, y: 14 }],
      risk: [{ x: 24, y: 15 }, "up", { x: 22, y: 14 }],
      chair: [{ x: 22, y: 12 }, "down", { x: 22, y: 14 }],
    });
    expect(forumMembers.map((member) => member.id)).toEqual([
      "market",
      "company",
      "financial",
      "risk",
      "chair",
    ]);
    expect(departmentMembers.map((member) => member.id)).toEqual([
      "market_news",
      "benchmark",
      "company_product",
      "company_competition",
      "valuation",
      "financial_quality",
      "risk_policy",
    ]);
  });

  it("accepts the approved fixture with unique walkable anchors", () => {
    // Given
    const manifest = contractManifest();
    const anchors = [
      ...manifest.roster.map((member) => member.seat.cell),
      ...Object.values(manifest.departments).flatMap((department) => [
        ...department.talkAnchors.map((anchor) => anchor.cell),
        department.visitorAnchor.cell,
      ]),
      ...Object.values(manifest.forum.anchors).map((anchor) => anchor.cell),
    ];
    const areas = [
      ...Object.values(manifest.departments).map(
        (department) => department.room,
      ),
      manifest.chairOffice.room,
      ...manifest.world.corridorBands,
    ];
    // When
    const blocked = anchors.filter(
      (cell) =>
        !areas.some(
          (area) =>
            cell.x >= area.min.x &&
            cell.x <= area.max.x &&
            cell.y >= area.min.y &&
            cell.y <= area.max.y,
        ),
    );
    // Then
    expect(new Set(anchors.map((cell) => `${cell.x},${cell.y}`)).size).toBe(
      anchors.length,
    );
    expect(blocked).toEqual([]);
    expect(validateOfficeSceneManifest(manifest)).toEqual([]);
  });

  it("reports a precise duplicate-anchor error", () => {
    // Given
    const manifest = structuredClone(contractManifest());
    const market = manifest.departments.market;
    if (!market) throw new Error("Market department is missing");
    const first = market.talkAnchors.at(0);
    const second = market.talkAnchors.at(1);
    if (!first || !second) throw new Error("Market talk anchors are missing");
    Reflect.set(second, "cell", first.cell);
    // When
    const errors = validateOfficeSceneManifest(manifest);
    // Then
    expect(errors).toContain(
      "anchor market:talk:market_news duplicates market:talk:market at 14,10",
    );
  });

  it("reports a precise wrong-facing error", () => {
    // Given
    const manifest = structuredClone(contractManifest());
    const june = manifest.roster.find((member) => member.id === "market_news");
    if (!june) throw new Error("June is missing");
    Reflect.set(june.seat, "facing", "left");
    // When
    const errors = validateOfficeSceneManifest(manifest);
    // Then
    expect(errors).toContain("market_news:seat does not face input 7,10");
  });

  it("reports a precise missing-locale error", () => {
    // Given
    const manifest = structuredClone(contractManifest());
    const june = manifest.roster.find((member) => member.id === "market_news");
    if (!june) throw new Error("June is missing");
    Reflect.deleteProperty(june.role, "ko");
    // When
    const errors = validateOfficeSceneManifest(manifest);
    // Then
    expect(errors).toContain("market_news:role.ko is missing");
  });
});
