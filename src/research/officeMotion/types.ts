export type Point = { readonly x: number; readonly y: number };
export type Facing = "up" | "down" | "left" | "right";
export type ActorId =
  | "market"
  | "market_news"
  | "benchmark"
  | "company"
  | "company_product"
  | "company_competition"
  | "financial"
  | "valuation"
  | "financial_quality"
  | "risk"
  | "risk_policy"
  | "chair";
export type Action =
  | "idle"
  | "walk"
  | "turn"
  | "sit"
  | "stand"
  | "typing"
  | "read"
  | "write"
  | "discover"
  | "present"
  | "listen"
  | "challenge"
  | "agree"
  | "carry";
export type ActorDefinition = {
  readonly id: ActorId;
  readonly name: string;
  readonly role: string;
  readonly color: string;
  readonly seat: Point;
  readonly homeFacing: Facing;
  readonly lead: boolean;
};
export type ActorFrame = {
  readonly id: ActorId;
  readonly position: Point;
  readonly facing: Facing;
  readonly headFacing: Facing;
  readonly action: Action;
  readonly progress: number;
  readonly gait: number;
  readonly seated: boolean;
  readonly evidence: boolean;
  readonly emphasis: number;
  readonly speech: string | null;
};
export type SceneFrame = {
  readonly time: number;
  readonly actors: readonly ActorFrame[];
  readonly speaker: ActorId | null;
};
export type Rect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};
export type SeatPlace = { readonly position: Point; readonly facing: Facing };
export type TeamTable = {
  readonly id: "market" | "company" | "financial" | "risk";
  readonly label: string;
  readonly color: string;
  readonly center: Point;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly seats: readonly (SeatPlace & { readonly id: ActorId })[];
};
export type Assets = ReadonlyMap<string, HTMLImageElement>;
