import type { ResearchLocale } from "../lib/i18n";
import type {
  OfficeFacing,
  OfficeManifestAgentId,
} from "./officeSceneManifest";

export type OfficeAgentVisualPose =
  | "idle"
  | "listen"
  | "present"
  | "react"
  | "seated-listen"
  | "seated-talk"
  | "seated-work"
  | "sit-down"
  | "stand-up"
  | "talk"
  | "turn"
  | "walk";

export type OfficeAgentClipName = OfficeAgentVisualPose;

export type OfficeAgentClipContract = {
  readonly frames: number;
  readonly fps: number;
  readonly facings: readonly OfficeFacing[];
  readonly loop: boolean;
};

export type OfficeAgentPersona = {
  readonly codename: Readonly<Record<ResearchLocale, string>>;
  readonly motif: Readonly<Record<ResearchLocale, string>>;
  readonly motionCharacter:
    | "authoritative"
    | "deliberate"
    | "energetic"
    | "observant"
    | "precise";
};

const ALL_FACINGS = Object.freeze([
  "down",
  "left",
  "right",
  "up",
] as const satisfies readonly OfficeFacing[]);

const SEATED_FACINGS = Object.freeze([
  "down",
  "up",
] as const satisfies readonly OfficeFacing[]);

export const OFFICE_AGENT_VISUAL_CONTRACT = Object.freeze({
  version: 1,
  atlas: Object.freeze({
    imageFile: "atlas.png",
    dataFile: "atlas.json",
    portraitFile: "portrait.png",
    profileFile: "profile.json",
  }),
  motion: Object.freeze({
    cellDurationMs: 100,
    turnDurationMs: 100,
    arrivalSettleMs: 250,
    speedVariance: 0.05,
  }),
  clips: Object.freeze({
    idle: Object.freeze({
      frames: 2,
      fps: 2,
      facings: ALL_FACINGS,
      loop: true,
    }),
    walk: Object.freeze({
      frames: 4,
      fps: 9,
      facings: ALL_FACINGS,
      loop: true,
    }),
    turn: Object.freeze({
      frames: 2,
      fps: 10,
      facings: ALL_FACINGS,
      loop: false,
    }),
    "sit-down": Object.freeze({
      frames: 3,
      fps: 9,
      facings: SEATED_FACINGS,
      loop: false,
    }),
    "stand-up": Object.freeze({
      frames: 3,
      fps: 9,
      facings: SEATED_FACINGS,
      loop: false,
    }),
    "seated-work": Object.freeze({
      frames: 4,
      fps: 4,
      facings: SEATED_FACINGS,
      loop: true,
    }),
    "seated-talk": Object.freeze({
      frames: 3,
      fps: 4,
      facings: SEATED_FACINGS,
      loop: true,
    }),
    "seated-listen": Object.freeze({
      frames: 2,
      fps: 2,
      facings: SEATED_FACINGS,
      loop: true,
    }),
    talk: Object.freeze({
      frames: 3,
      fps: 4,
      facings: ALL_FACINGS,
      loop: true,
    }),
    listen: Object.freeze({
      frames: 2,
      fps: 2,
      facings: ALL_FACINGS,
      loop: true,
    }),
    present: Object.freeze({
      frames: 5,
      fps: 5,
      facings: ALL_FACINGS,
      loop: true,
    }),
    react: Object.freeze({
      frames: 3,
      fps: 4,
      facings: ALL_FACINGS,
      loop: false,
    }),
  } satisfies Readonly<Record<OfficeAgentClipName, OfficeAgentClipContract>>),
});

export const OFFICE_AGENT_PERSONAS: Readonly<
  Record<OfficeManifestAgentId, OfficeAgentPersona>
> = Object.freeze({
  market: {
    codename: { en: "Regime Detective", ko: "레짐 탐정" },
    motif: { en: "market radar", ko: "시장 레이더" },
    motionCharacter: "observant",
  },
  market_news: {
    codename: { en: "Tape Reader", ko: "테이프 리더" },
    motif: { en: "chart tablet", ko: "차트 태블릿" },
    motionCharacter: "energetic",
  },
  benchmark: {
    codename: { en: "Beta Cartographer", ko: "베타 지도사" },
    motif: { en: "comparison ruler", ko: "비교 자" },
    motionCharacter: "precise",
  },
  company: {
    codename: { en: "Moat Hunter", ko: "모트 헌터" },
    motif: { en: "moat map", ko: "경쟁우위 지도" },
    motionCharacter: "deliberate",
  },
  company_product: {
    codename: { en: "Product Scout", ko: "프로덕트 스카우트" },
    motif: { en: "prototype board", ko: "제품 보드" },
    motionCharacter: "energetic",
  },
  company_competition: {
    codename: { en: "War-room Strategist", ko: "워룸 전략가" },
    motif: { en: "competitive map", ko: "경쟁 지도" },
    motionCharacter: "precise",
  },
  financial: {
    codename: { en: "Forensic Accountant", ko: "포렌식 회계사" },
    motif: { en: "audit ledger", ko: "감사 원장" },
    motionCharacter: "deliberate",
  },
  valuation: {
    codename: { en: "Price Architect", ko: "가격 설계자" },
    motif: { en: "valuation scale", ko: "가치 저울" },
    motionCharacter: "precise",
  },
  financial_quality: {
    codename: { en: "Disclosure Detective", ko: "공시 탐정" },
    motif: { en: "highlighted filing", ko: "형광펜 공시" },
    motionCharacter: "observant",
  },
  risk: {
    codename: { en: "Red Team", ko: "레드팀" },
    motif: { en: "warning shield", ko: "경고 방패" },
    motionCharacter: "authoritative",
  },
  risk_policy: {
    codename: { en: "Scenario Watcher", ko: "시나리오 워처" },
    motif: { en: "branching timeline", ko: "분기 타임라인" },
    motionCharacter: "observant",
  },
  chair: {
    codename: { en: "Evidence Judge", ko: "증거 판사" },
    motif: { en: "evidence docket", ko: "근거 기록철" },
    motionCharacter: "authoritative",
  },
});
