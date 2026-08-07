import { OFFICE_ENTITY_GEOMETRY } from "./officeEntityGeometry";

export type OfficeFacing = "down" | "left" | "right" | "up";

export type Cell = {
  readonly x: number;
  readonly y: number;
};

export type WorldPoint = {
  readonly x: number;
  readonly y: number;
};

export type CellRect = {
  readonly min: Cell;
  readonly max: Cell;
};

export type LocalizedPublicText = {
  readonly en: string;
  readonly ko: string;
};

export type OfficeSceneManifestContract = {
  readonly version: number;
  readonly world: {
    readonly width: number;
    readonly height: number;
    readonly cellSize: number;
    readonly columns: number;
    readonly rows: number;
    readonly corridorBands: readonly CellRect[];
    readonly blockedCells: readonly Cell[];
  };
  readonly assets: {
    readonly base: string;
    readonly actorsRoot: string;
    readonly v9ActorsRoot: string;
    readonly entitiesRoot: string;
  };
  readonly rooms: Readonly<
    Record<
      "chair" | "company" | "financial" | "market" | "risk",
      { readonly bounds: CellRect; readonly doors: readonly Cell[] }
    >
  >;
  readonly furniture: readonly {
    readonly id: string;
    readonly roomId: "chair" | "company" | "financial" | "market" | "risk";
    readonly kind: "desk" | "oval" | "round" | "strategy";
    readonly footprint: CellRect;
    readonly accent: number;
  }[];
  readonly roster: readonly {
    readonly id: string;
    readonly departmentId: string;
    readonly representative: boolean;
    readonly hasV6Asset: boolean;
    readonly v6Slot: string | null;
    readonly assetSourceId?: string;
    readonly assetTint?: readonly [number, number, number];
    readonly name: LocalizedPublicText;
    readonly role: LocalizedPublicText;
    readonly specialty: LocalizedPublicText;
    readonly seat: {
      readonly cell: Cell;
      readonly inputCell: Cell;
      readonly facing: OfficeFacing;
    };
    readonly finalLocation: "department" | "forum";
  }[];
  readonly departments: Readonly<
    Record<
      string,
      {
        readonly memberIds: readonly string[];
        readonly representativeId: string;
        readonly room: CellRect;
        readonly door: Cell;
        readonly talkAnchors: readonly {
          readonly agentId: string;
          readonly cell: Cell;
          readonly facing: OfficeFacing;
          readonly target: Cell;
        }[];
        readonly visitorAnchor: {
          readonly cell: Cell;
          readonly facing: OfficeFacing;
        };
      }
    >
  >;
  readonly chairOffice: { readonly room: CellRect; readonly door: Cell };
  readonly forum: {
    readonly room: CellRect;
    readonly target: Cell;
    readonly anchors: Readonly<
      Record<
        string,
        {
          readonly agentId: string;
          readonly cell: Cell;
          readonly facing: OfficeFacing;
          readonly target: Cell;
        }
      >
    >;
  };
};

// allow: SIZE_OK — the immutable roster and geometry table is the world source of truth.
export const OFFICE_SCENE_MANIFEST = {
  version: 9,
  world: {
    width: 1374,
    height: 1145,
    cellSize: 32,
    columns: 43,
    rows: 35,
    corridorBands: [{ min: { x: 20, y: 15 }, max: { x: 22, y: 33 } }],
    blockedCells: [],
  },
  assets: {
    base: "/research/office-v8/base.png",
    actorsRoot: "/research/office-v7/agents",
    v9ActorsRoot: "/research/office-v9/agents",
    entitiesRoot: "/research/office-v9/entities",
  },
  rooms: {
    market: {
      bounds: { min: { x: 1, y: 1 }, max: { x: 16, y: 16 } },
      doors: [
        { x: 16, y: 9 },
        { x: 16, y: 10 },
      ],
    },
    chair: {
      bounds: { min: { x: 17, y: 1 }, max: { x: 28, y: 16 } },
      doors: [
        { x: 17, y: 9 },
        { x: 17, y: 10 },
        { x: 28, y: 9 },
        { x: 28, y: 10 },
        { x: 21, y: 16 },
        { x: 22, y: 16 },
      ],
    },
    company: {
      bounds: { min: { x: 29, y: 1 }, max: { x: 41, y: 16 } },
      doors: [
        { x: 29, y: 9 },
        { x: 29, y: 10 },
      ],
    },
    financial: {
      bounds: { min: { x: 1, y: 17 }, max: { x: 19, y: 33 } },
      doors: [
        { x: 19, y: 23 },
        { x: 19, y: 24 },
      ],
    },
    risk: {
      bounds: { min: { x: 23, y: 17 }, max: { x: 41, y: 33 } },
      doors: [
        { x: 23, y: 23 },
        { x: 23, y: 24 },
      ],
    },
  },
  furniture: [
    {
      id: "market-table",
      roomId: "market",
      kind: "round",
      // Keep the three market seats on the same table footprint.  The old
      // six-cell footprint left the benchmark chair (x=12) floating outside
      // the table and made its laptop look detached from the room.
      footprint: { min: { x: 5, y: 8 }, max: { x: 11, y: 10 } },
      accent: 0x5b82a5,
    },
    {
      id: "chair-desk",
      roomId: "chair",
      kind: "desk",
      footprint: { min: { x: 20, y: 8 }, max: { x: 25, y: 10 } },
      accent: 0xc58a43,
    },
    {
      id: "company-table",
      roomId: "company",
      kind: "oval",
      footprint: { min: { x: 32, y: 8 }, max: { x: 38, y: 10 } },
      accent: 0x4e9b91,
    },
    {
      id: "financial-table",
      roomId: "financial",
      kind: "desk",
      footprint: { min: { x: 6, y: 25 }, max: { x: 12, y: 27 } },
      accent: 0xb68c5a,
    },
    {
      id: "risk-table",
      roomId: "risk",
      kind: "strategy",
      footprint: { min: { x: 30, y: 25 }, max: { x: 35, y: 27 } },
      accent: 0x8b6f93,
    },
  ],
  roster: [
    {
      id: "market",
      departmentId: "market",
      representative: true,
      hasV6Asset: true,
      v6Slot: "north-west",
      name: { en: "Maya", ko: "마야" },
      role: { en: "Market Lead", ko: "시장 책임" },
      specialty: { en: "Market regime and synthesis", ko: "시장 국면·종합" },
      seat: {
        // Keep the lead directly above the tabletop.  The input rests on the
        // table's north edge while the actor remains on the chair anchor.
        cell: { x: 8, y: 7 },
        inputCell: { x: 8, y: 8 },
        facing: "down",
      },
      finalLocation: "forum",
    },
    {
      id: "market_news",
      departmentId: "market",
      representative: false,
      hasV6Asset: false,
      v6Slot: "north-west",
      name: { en: "June", ko: "준" },
      role: { en: "Technical Analyst", ko: "기술적 분석가" },
      specialty: {
        en: "Trend, momentum, volatility and volume",
        ko: "추세·모멘텀·변동성·거래량",
      },
      seat: {
        cell: { x: 7, y: 11 },
        inputCell: { x: 7, y: 10 },
        facing: "up",
      },
      finalLocation: "department",
    },
    {
      id: "benchmark",
      departmentId: "market",
      representative: false,
      hasV6Asset: false,
      v6Slot: "north-west",
      name: { en: "Alex", ko: "알렉스" },
      role: {
        en: "Benchmark & Cross-Asset Analyst",
        ko: "벤치마크·크로스에셋 분석가",
      },
      specialty: {
        en: "Indices, sector ETFs, peers, rates and beta",
        ko: "지수·섹터 ETF·동종사·금리·베타",
      },
      seat: {
        cell: { x: 9, y: 11 },
        inputCell: { x: 9, y: 10 },
        facing: "up",
      },
      finalLocation: "department",
    },
    {
      id: "company",
      departmentId: "company",
      representative: true,
      hasV6Asset: true,
      v6Slot: "north-east",
      name: { en: "Ethan", ko: "이든" },
      role: { en: "Company Lead", ko: "기업 책임" },
      specialty: {
        en: "Moat, strategy and synthesis",
        ko: "경쟁우위·전략·종합",
      },
      seat: {
        cell: { x: 35, y: 7 },
        inputCell: { x: 35, y: 8 },
        facing: "down",
      },
      finalLocation: "forum",
    },
    {
      id: "company_product",
      departmentId: "company",
      representative: false,
      hasV6Asset: false,
      v6Slot: "north-east",
      name: { en: "Aria", ko: "아리아" },
      role: { en: "Product Analyst", ko: "제품 분석가" },
      specialty: { en: "Product adoption and roadmap", ko: "제품 채택·로드맵" },
      seat: {
        cell: { x: 34, y: 11 },
        inputCell: { x: 34, y: 10 },
        facing: "up",
      },
      finalLocation: "department",
    },
    {
      id: "company_competition",
      departmentId: "company",
      representative: false,
      hasV6Asset: false,
      v6Slot: "north-east",
      name: { en: "Leo", ko: "레오" },
      role: { en: "Competitive Intelligence", ko: "경쟁 정보" },
      specialty: {
        en: "Competition and positioning",
        ko: "경쟁 구도·포지셔닝",
      },
      seat: {
        cell: { x: 37, y: 11 },
        inputCell: { x: 37, y: 10 },
        facing: "up",
      },
      finalLocation: "department",
    },
    {
      id: "financial",
      departmentId: "financial",
      representative: true,
      hasV6Asset: true,
      v6Slot: "west",
      name: { en: "Noah", ko: "노아" },
      role: { en: "Financial Lead", ko: "재무 책임" },
      specialty: {
        en: "Financial statements and synthesis",
        ko: "재무제표·종합",
      },
      seat: {
        cell: { x: 7, y: 24 },
        inputCell: { x: 7, y: 25 },
        facing: "down",
      },
      finalLocation: "forum",
    },
    {
      id: "valuation",
      departmentId: "financial",
      representative: false,
      hasV6Asset: true,
      v6Slot: "east",
      name: { en: "Sofia", ko: "소피아" },
      role: { en: "Valuation Analyst", ko: "가치평가 분석가" },
      specialty: {
        en: "Valuation multiples and earnings scenarios",
        ko: "가치평가 배수·이익 시나리오",
      },
      seat: {
        cell: { x: 11, y: 24 },
        inputCell: { x: 11, y: 25 },
        facing: "down",
      },
      finalLocation: "department",
    },
    {
      id: "financial_quality",
      departmentId: "financial",
      representative: false,
      hasV6Asset: false,
      v6Slot: "west",
      name: { en: "Hana", ko: "하나" },
      role: { en: "Earnings Quality", ko: "이익의 질" },
      specialty: {
        en: "Earnings quality and disclosures",
        ko: "이익의 질·공시",
      },
      seat: {
        cell: { x: 9, y: 28 },
        inputCell: { x: 9, y: 27 },
        facing: "up",
      },
      finalLocation: "department",
    },
    {
      id: "risk",
      departmentId: "risk",
      representative: true,
      hasV6Asset: true,
      v6Slot: "south-west",
      name: { en: "Liam", ko: "리암" },
      role: { en: "Risk Lead", ko: "리스크 책임" },
      specialty: { en: "Downside risks and synthesis", ko: "하방 위험·종합" },
      seat: {
        cell: { x: 31, y: 24 },
        inputCell: { x: 31, y: 25 },
        facing: "down",
      },
      finalLocation: "forum",
    },
    {
      id: "risk_policy",
      departmentId: "risk",
      representative: false,
      hasV6Asset: false,
      v6Slot: "south-west",
      name: { en: "Min", ko: "민" },
      role: { en: "Policy & Scenario", ko: "정책·시나리오" },
      specialty: {
        en: "Policy shocks and scenarios",
        ko: "정책 충격·시나리오",
      },
      seat: {
        cell: { x: 34, y: 28 },
        inputCell: { x: 34, y: 27 },
        facing: "up",
      },
      finalLocation: "department",
    },
    {
      id: "chair",
      departmentId: "chair",
      representative: false,
      hasV6Asset: true,
      v6Slot: "south-east",
      name: { en: "Dr. Park", ko: "박 의장" },
      role: { en: "Research Chair", ko: "리서치 의장" },
      specialty: { en: "Synthesis and evidence audit", ko: "종합·근거 감사" },
      seat: {
        cell: { x: 22, y: 11 },
        inputCell: { x: 22, y: 10 },
        facing: "up",
      },
      finalLocation: "forum",
    },
  ],
  departments: {
    market: {
      memberIds: ["market", "market_news", "benchmark"],
      representativeId: "market",
      room: { min: { x: 1, y: 1 }, max: { x: 16, y: 16 } },
      door: { x: 16, y: 10 },
      talkAnchors: [
        {
          agentId: "market",
          cell: { x: 14, y: 10 },
          facing: "left",
          target: { x: 12, y: 10 },
        },
        {
          agentId: "market_news",
          cell: { x: 12, y: 10 },
          facing: "right",
          target: { x: 14, y: 10 },
        },
        {
          agentId: "benchmark",
          cell: { x: 11, y: 12 },
          facing: "up",
          target: { x: 12, y: 10 },
        },
      ],
      visitorAnchor: { cell: { x: 15, y: 10 }, facing: "left" },
    },
    company: {
      memberIds: ["company", "company_product", "company_competition"],
      representativeId: "company",
      room: { min: { x: 29, y: 1 }, max: { x: 41, y: 16 } },
      door: { x: 29, y: 10 },
      talkAnchors: [
        {
          agentId: "company",
          cell: { x: 31, y: 10 },
          facing: "right",
          target: { x: 33, y: 12 },
        },
        {
          agentId: "company_product",
          cell: { x: 33, y: 12 },
          facing: "left",
          target: { x: 31, y: 10 },
        },
        {
          agentId: "company_competition",
          cell: { x: 34, y: 14 },
          facing: "up",
          target: { x: 33, y: 12 },
        },
      ],
      visitorAnchor: { cell: { x: 30, y: 10 }, facing: "right" },
    },
    financial: {
      memberIds: ["financial", "valuation", "financial_quality"],
      representativeId: "financial",
      room: { min: { x: 1, y: 17 }, max: { x: 19, y: 33 } },
      door: { x: 19, y: 24 },
      talkAnchors: [
        {
          agentId: "financial",
          cell: { x: 17, y: 24 },
          facing: "left",
          target: { x: 15, y: 24 },
        },
        {
          agentId: "valuation",
          cell: { x: 15, y: 24 },
          facing: "right",
          target: { x: 17, y: 24 },
        },
        {
          agentId: "financial_quality",
          cell: { x: 15, y: 26 },
          facing: "up",
          target: { x: 15, y: 24 },
        },
      ],
      visitorAnchor: { cell: { x: 18, y: 24 }, facing: "left" },
    },
    risk: {
      memberIds: ["risk", "risk_policy"],
      representativeId: "risk",
      room: { min: { x: 23, y: 17 }, max: { x: 41, y: 33 } },
      door: { x: 23, y: 24 },
      talkAnchors: [
        {
          agentId: "risk",
          cell: { x: 25, y: 24 },
          facing: "right",
          target: { x: 27, y: 24 },
        },
        {
          agentId: "risk_policy",
          cell: { x: 27, y: 24 },
          facing: "left",
          target: { x: 25, y: 24 },
        },
      ],
      visitorAnchor: { cell: { x: 24, y: 24 }, facing: "right" },
    },
  },
  chairOffice: {
    room: { min: { x: 17, y: 1 }, max: { x: 28, y: 16 } },
    door: { x: 21, y: 16 },
  },
  forum: {
    room: { min: { x: 18, y: 10 }, max: { x: 27, y: 16 } },
    target: { x: 22, y: 14 },
    anchors: OFFICE_ENTITY_GEOMETRY.evidenceForum.anchors,
  },
} as const satisfies OfficeSceneManifestContract;

export type OfficeManifestAgentId =
  (typeof OFFICE_SCENE_MANIFEST.roster)[number]["id"];
export type OfficeDepartmentId = keyof typeof OFFICE_SCENE_MANIFEST.departments;
type RosterMember = (typeof OFFICE_SCENE_MANIFEST.roster)[number];
type LegacyRosterMember = Extract<RosterMember, { readonly hasV6Asset: true }>;
export type LegacyAgentId = LegacyRosterMember["id"];
export type LegacyOfficeSlot = Exclude<LegacyRosterMember["v6Slot"], null>;

function isLegacyMember(member: RosterMember): member is LegacyRosterMember {
  return member.hasV6Asset;
}

export const AGENT_IDS: readonly OfficeManifestAgentId[] = Object.freeze(
  OFFICE_SCENE_MANIFEST.roster.map((member) => member.id),
);
export const LEGACY_AGENT_IDS: readonly LegacyAgentId[] = Object.freeze(
  OFFICE_SCENE_MANIFEST.roster
    .filter(isLegacyMember)
    .map((member) => member.id),
);

export type WorkSeatId = `${OfficeManifestAgentId}:work`;

export type OfficeWorkSeat = {
  readonly id: WorkSeatId;
  readonly agentId: OfficeManifestAgentId;
  readonly hip: WorldPoint;
  readonly approach: WorldPoint;
  readonly inputTarget: WorldPoint;
  readonly interactionTarget: WorldPoint;
  readonly direction: OfficeFacing;
  readonly chairScale: number;
  readonly chairAnchor: WorldPoint;
  readonly headOffset: WorldPoint;
  readonly labelOffset: WorldPoint;
  readonly bubbleOffset: WorldPoint;
  readonly layers: {
    readonly chair: number;
    readonly actor: number;
    readonly label: number;
    readonly bubble: number;
  };
};

export type MeetingSpot = {
  readonly agentId: OfficeManifestAgentId;
  readonly point: WorldPoint;
  readonly approach: WorldPoint;
  readonly interactionTarget: WorldPoint;
  readonly direction: OfficeFacing;
};

export const OFFICE_SCENE_ASSETS = {
  base: "/research/office-v6/base.png",
  agent: (agentId: OfficeManifestAgentId) =>
    `/research/office-v6/agents/${agentId}.png`,
  chair: (direction: OfficeFacing) =>
    `/research/office-v6/furniture/chair-${direction}.png`,
} as const;

const visualOffsets = {
  headOffset: { x: 0, y: -118 },
  labelOffset: { x: 0, y: -146 },
  bubbleOffset: { x: 0, y: -194 },
  layers: { chair: 5, actor: 20, label: 40, bubble: 50 },
} as const;

const v6SeatPlacements = {
  "north-west": {
    hip: { x: 390, y: 300 },
    approach: { x: 390, y: 350 },
    inputTarget: { x: 390, y: 225 },
    interactionTarget: { x: 390, y: 170 },
    direction: "up",
  },
  "north-east": {
    hip: { x: 1055, y: 300 },
    approach: { x: 1055, y: 350 },
    inputTarget: { x: 1055, y: 225 },
    interactionTarget: { x: 1055, y: 170 },
    direction: "up",
  },
  west: {
    hip: { x: 275, y: 520 },
    approach: { x: 335, y: 520 },
    inputTarget: { x: 210, y: 520 },
    interactionTarget: { x: 120, y: 520 },
    direction: "left",
  },
  east: {
    hip: { x: 1173, y: 520 },
    approach: { x: 1113, y: 520 },
    inputTarget: { x: 1235, y: 520 },
    interactionTarget: { x: 1328, y: 520 },
    direction: "right",
  },
  "south-west": {
    hip: { x: 390, y: 790 },
    approach: { x: 390, y: 710 },
    inputTarget: { x: 390, y: 850 },
    interactionTarget: { x: 390, y: 910 },
    direction: "down",
  },
  "south-east": {
    hip: { x: 1055, y: 790 },
    approach: { x: 1055, y: 710 },
    inputTarget: { x: 1055, y: 850 },
    interactionTarget: { x: 1055, y: 910 },
    direction: "down",
  },
} as const satisfies Readonly<Record<LegacyOfficeSlot, object>>;

const v6MeetingPlacements = {
  "north-west": {
    point: { x: 620, y: 450 },
    approach: { x: 620, y: 420 },
    interactionTarget: { x: 724, y: 565 },
    direction: "down",
  },
  "north-east": {
    point: { x: 828, y: 450 },
    approach: { x: 828, y: 420 },
    interactionTarget: { x: 724, y: 565 },
    direction: "down",
  },
  west: {
    point: { x: 535, y: 565 },
    approach: { x: 480, y: 565 },
    interactionTarget: { x: 724, y: 565 },
    direction: "right",
  },
  east: {
    point: { x: 913, y: 565 },
    approach: { x: 968, y: 565 },
    interactionTarget: { x: 724, y: 565 },
    direction: "left",
  },
  "south-west": {
    point: { x: 620, y: 680 },
    approach: { x: 620, y: 710 },
    interactionTarget: { x: 724, y: 565 },
    direction: "up",
  },
  "south-east": {
    point: { x: 828, y: 680 },
    approach: { x: 828, y: 710 },
    interactionTarget: { x: 724, y: 565 },
    direction: "up",
  },
} as const satisfies Readonly<Record<LegacyOfficeSlot, object>>;

function workSeatForMember(member: RosterMember): OfficeWorkSeat {
  const placement = v6SeatPlacements[member.v6Slot];
  return {
    id: `${member.id}:work`,
    agentId: member.id,
    ...placement,
    chairScale: 1,
    chairAnchor: { x: 0.5, y: 0.9 },
    ...visualOffsets,
  };
}

function meetingSpotForMember(member: RosterMember): MeetingSpot {
  return { agentId: member.id, ...v6MeetingPlacements[member.v6Slot] };
}

const seatEntries = OFFICE_SCENE_MANIFEST.roster.map(
  (member) => [`${member.id}:work`, workSeatForMember(member)] as const,
);
const meetingEntries = OFFICE_SCENE_MANIFEST.roster.map(
  (member) => [member.id, meetingSpotForMember(member)] as const,
);
const seatsByAgent = new Map(
  OFFICE_SCENE_MANIFEST.roster.map(
    (member) => [member.id, workSeatForMember(member)] as const,
  ),
);
const meetingsByAgent = new Map(
  OFFICE_SCENE_MANIFEST.roster.map(
    (member) => [member.id, meetingSpotForMember(member)] as const,
  ),
);

export const SEAT_MANIFEST = Object.freeze(Object.fromEntries(seatEntries));
export const MEETING_SPOTS = Object.freeze(Object.fromEntries(meetingEntries));

export function seatFor(agentId: OfficeManifestAgentId): OfficeWorkSeat {
  const seat = seatsByAgent.get(agentId);
  if (!seat) throw new RangeError(`No work seat for ${agentId}`);
  return seat;
}

export function meetingSpotFor(agentId: OfficeManifestAgentId): MeetingSpot {
  const meeting = meetingsByAgent.get(agentId);
  if (!meeting) throw new RangeError(`No meeting spot for ${agentId}`);
  return meeting;
}

function facesTarget(
  origin: Cell,
  target: Cell,
  direction: OfficeFacing,
): boolean {
  const deltaX = target.x - origin.x;
  const deltaY = target.y - origin.y;
  switch (direction) {
    case "down":
      return deltaY > 0;
    case "left":
      return deltaX < 0;
    case "right":
      return deltaX > 0;
    case "up":
      return deltaY < 0;
  }
}

function containsCell(rect: CellRect, cell: Cell): boolean {
  return (
    cell.x >= rect.min.x &&
    cell.x <= rect.max.x &&
    cell.y >= rect.min.y &&
    cell.y <= rect.max.y
  );
}

export function validateOfficeSceneManifest(
  candidate: OfficeSceneManifestContract = OFFICE_SCENE_MANIFEST,
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const member of candidate.roster) {
    if (ids.has(member.id)) errors.push(`${member.id}:id is duplicated`);
    ids.add(member.id);
    for (const [field, localized] of Object.entries({
      name: member.name,
      role: member.role,
      specialty: member.specialty,
    })) {
      for (const locale of ["en", "ko"] as const) {
        if (
          typeof localized[locale] !== "string" ||
          localized[locale].trim().length === 0
        ) {
          errors.push(`${member.id}:${field}.${locale} is missing`);
        }
      }
    }
    if (
      !facesTarget(member.seat.cell, member.seat.inputCell, member.seat.facing)
    ) {
      errors.push(
        `${member.id}:seat does not face input ${member.seat.inputCell.x},${member.seat.inputCell.y}`,
      );
    }
  }

  const areas = [
    ...Object.values(candidate.departments).map(
      (department) => department.room,
    ),
    candidate.chairOffice.room,
    ...candidate.world.corridorBands,
  ];
  const occupied = new Map<string, string>();
  const registerAnchor = (label: string, cell: Cell): void => {
    const key = `${cell.x},${cell.y}`;
    const prior = occupied.get(key);
    if (prior) errors.push(`anchor ${label} duplicates ${prior} at ${key}`);
    else occupied.set(key, label);
    if (!areas.some((area) => containsCell(area, cell))) {
      errors.push(`anchor ${label} is blocked at ${key}`);
    }
  };
  for (const member of candidate.roster)
    registerAnchor(`${member.id}:seat`, member.seat.cell);
  for (const [departmentId, department] of Object.entries(
    candidate.departments,
  )) {
    for (const anchor of department.talkAnchors) {
      registerAnchor(`${departmentId}:talk:${anchor.agentId}`, anchor.cell);
      if (!facesTarget(anchor.cell, anchor.target, anchor.facing)) {
        errors.push(
          `${departmentId}:talk:${anchor.agentId} has invalid facing`,
        );
      }
    }
    registerAnchor(`${departmentId}:visitor`, department.visitorAnchor.cell);
  }
  for (const [agentId, anchor] of Object.entries(candidate.forum.anchors)) {
    registerAnchor(`forum:${agentId}`, anchor.cell);
    if (!facesTarget(anchor.cell, anchor.target, anchor.facing)) {
      errors.push(
        `forum:${agentId} does not face ${anchor.target.x},${anchor.target.y}`,
      );
    }
  }
  const forumIds = new Set(Object.keys(candidate.forum.anchors));
  for (const member of candidate.roster) {
    const belongsAtForum = member.finalLocation === "forum";
    if (belongsAtForum !== forumIds.has(member.id)) {
      errors.push(`${member.id}:final location does not match forum ownership`);
    }
  }
  return errors;
}
