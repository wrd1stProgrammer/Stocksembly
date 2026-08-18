import { describe, expect, it } from "vitest";
import {
  AGENT_IDS,
  OFFICE_SCENE_MANIFEST,
  validateOfficeSceneManifest,
} from "./officeSceneManifest";

function contractManifest(): typeof OFFICE_SCENE_MANIFEST {
  return OFFICE_SCENE_MANIFEST;
}

const expectedWorkSeats = {
  market: [{ x: 4, y: 6 }, { x: 4, y: 5 }, "up"],
  market_news: [{ x: 8, y: 6 }, { x: 8, y: 5 }, "up"],
  benchmark: [{ x: 12, y: 6 }, { x: 12, y: 5 }, "up"],
  company: [{ x: 31, y: 6 }, { x: 31, y: 5 }, "up"],
  company_product: [{ x: 35, y: 6 }, { x: 35, y: 5 }, "up"],
  company_competition: [{ x: 39, y: 6 }, { x: 39, y: 5 }, "up"],
  financial: [{ x: 4, y: 24 }, { x: 4, y: 23 }, "up"],
  valuation: [{ x: 9, y: 24 }, { x: 9, y: 23 }, "up"],
  financial_quality: [{ x: 14, y: 24 }, { x: 14, y: 23 }, "up"],
  risk: [{ x: 32, y: 23 }, { x: 32, y: 22 }, "up"],
  risk_policy: [{ x: 36, y: 23 }, { x: 36, y: 22 }, "up"],
  chair: [{ x: 22, y: 11 }, { x: 22, y: 10 }, "up"],
} as const;

const expectedMeetingSeats = {
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

  it("locks every personal and meeting seat with vertical facings", () => {
    // Given
    const manifest = contractManifest();
    // When
    const workSeats = Object.fromEntries(
      manifest.roster.map((member) => [
        member.id,
        [
          member.workSeat.cell,
          member.workSeat.inputCell,
          member.workSeat.facing,
        ],
      ]),
    );
    const meetingSeats = Object.fromEntries(
      manifest.roster.map((member) => [
        member.id,
        [
          member.meetingSeat.cell,
          member.meetingSeat.inputCell,
          member.meetingSeat.facing,
        ],
      ]),
    );
    // Then
    expect(workSeats).toEqual(expectedWorkSeats);
    expect(meetingSeats).toEqual(expectedMeetingSeats);
    expect(
      manifest.roster
        .flatMap(({ workSeat, meetingSeat }) => [workSeat, meetingSeat])
        .every(
          (seat) =>
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
      "market-workstations": {
        min: { x: 2, y: 3 },
        max: { x: 13, y: 5 },
      },
      "market-table": { min: { x: 5, y: 8 }, max: { x: 11, y: 10 } },
      "chair-desk": { min: { x: 20, y: 8 }, max: { x: 25, y: 10 } },
      "company-workstations": {
        min: { x: 30, y: 3 },
        max: { x: 40, y: 5 },
      },
      "company-table": { min: { x: 32, y: 8 }, max: { x: 38, y: 10 } },
      "financial-workstations": {
        min: { x: 3, y: 20 },
        max: { x: 15, y: 23 },
      },
      "financial-table": { min: { x: 6, y: 25 }, max: { x: 12, y: 27 } },
      "risk-workstations": {
        min: { x: 30, y: 20 },
        max: { x: 38, y: 22 },
      },
      "risk-table": { min: { x: 30, y: 25 }, max: { x: 35, y: 27 } },
    });
    expect(manifest.furniture).toHaveLength(9);
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
        [{ x: 12, y: 11 }, "right"],
        [{ x: 12, y: 10 }, "right"],
        [{ x: 11, y: 12 }, "up"],
      ],
      company: [
        [{ x: 31, y: 10 }, "left"],
        [{ x: 33, y: 12 }, "left"],
        [{ x: 34, y: 14 }, "up"],
      ],
      financial: [
        [{ x: 13, y: 24 }, "right"],
        [{ x: 15, y: 25 }, "left"],
        [{ x: 15, y: 26 }, "up"],
      ],
      risk: [
        [{ x: 30, y: 23 }, "left"],
        [{ x: 27, y: 24 }, "left"],
      ],
    });
    expect(visitors).toEqual({
      market: { cell: { x: 14, y: 11 }, facing: "left" },
      company: { cell: { x: 29, y: 10 }, facing: "right" },
      financial: { cell: { x: 15, y: 24 }, facing: "left" },
      risk: { cell: { x: 28, y: 23 }, facing: "right" },
    });
  });

  it("keeps every cross-team exchange close to its table without crowding the leaders", () => {
    for (const [departmentId, department] of Object.entries(
      OFFICE_SCENE_MANIFEST.departments,
    )) {
      const host = department.talkAnchors.find(
        (anchor) => anchor.agentId === department.representativeId,
      );
      const table = OFFICE_SCENE_MANIFEST.furniture.find(
        (item) => item.roomId === departmentId && item.purpose === "meeting",
      );
      if (!host || !table) throw new RangeError(`Missing ${departmentId}`);
      const leaderDistance =
        Math.abs(host.cell.x - department.visitorAnchor.cell.x) +
        Math.abs(host.cell.y - department.visitorAnchor.cell.y);
      const tableDistance =
        Math.max(
          table.footprint.min.x - host.cell.x,
          0,
          host.cell.x - table.footprint.max.x,
        ) +
        Math.max(
          table.footprint.min.y - host.cell.y,
          0,
          host.cell.y - table.footprint.max.y,
        );

      expect(leaderDistance, departmentId).toBeGreaterThanOrEqual(2);
      expect(tableDistance, departmentId).toBeLessThanOrEqual(2);
    }
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
      ...manifest.roster.flatMap((member) => [
        member.workSeat.cell,
        ...(member.workSeat.cell.x === member.meetingSeat.cell.x &&
        member.workSeat.cell.y === member.meetingSeat.cell.y
          ? []
          : [member.meetingSeat.cell]),
      ]),
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
      "anchor market:talk:market_news duplicates market:talk:market at 12,11",
    );
  });

  it("reports a precise wrong-facing error", () => {
    // Given
    const manifest = structuredClone(contractManifest());
    const june = manifest.roster.find((member) => member.id === "market_news");
    if (!june) throw new Error("June is missing");
    Reflect.set(june.meetingSeat, "facing", "left");
    // When
    const errors = validateOfficeSceneManifest(manifest);
    // Then
    expect(errors).toContain(
      "market_news:meetingSeat does not face input 7,10",
    );
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
