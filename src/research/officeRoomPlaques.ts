import type { Locale } from "../lib/i18n";
import { OFFICE_ENTITY_GEOMETRY } from "./officeEntityGeometry";
import type { LocalizedPublicText, WorldPoint } from "./officeSceneManifest";

export type OfficeRoomPlaqueSpec = {
  readonly id: "chair" | "company" | "financial" | "market" | "risk";
  readonly position: WorldPoint;
  readonly size: { readonly width: number; readonly height: number };
  readonly accent: number;
  readonly name: LocalizedPublicText;
  readonly scope: LocalizedPublicText;
};

export const OFFICE_ROOM_PLAQUE_ASSET =
  "/research/office-v8/ui/room-plaque.svg";

export const OFFICE_ROOM_PLAQUES: readonly OfficeRoomPlaqueSpec[] =
  Object.freeze([
    {
      id: "market",
      position: OFFICE_ENTITY_GEOMETRY.roomSigns.market,
      size: OFFICE_ENTITY_GEOMETRY.roomSigns.market,
      accent: 0x5b82a5,
      name: { en: "MARKET", ko: "시장 분석" },
      scope: { en: "Market · News · Macro", ko: "시장 · 뉴스 · 거시경제" },
    },
    {
      id: "chair",
      position: OFFICE_ENTITY_GEOMETRY.roomSigns.chair,
      size: OFFICE_ENTITY_GEOMETRY.roomSigns.chair,
      accent: 0xc58a43,
      name: { en: "RESEARCH CHAIR", ko: "리서치 의장" },
      scope: { en: "Evidence audit · Synthesis", ko: "증거 감사 · 최종 종합" },
    },
    {
      id: "company",
      position: OFFICE_ENTITY_GEOMETRY.roomSigns.company,
      size: OFFICE_ENTITY_GEOMETRY.roomSigns.company,
      accent: 0x4e9b91,
      name: { en: "COMPANY", ko: "기업 분석" },
      scope: { en: "Product · Moat", ko: "제품 · 경쟁력" },
    },
    {
      id: "financial",
      position: OFFICE_ENTITY_GEOMETRY.roomSigns.financial,
      size: OFFICE_ENTITY_GEOMETRY.roomSigns.financial,
      accent: 0xb68c5a,
      name: { en: "FINANCIAL", ko: "재무 분석" },
      scope: {
        en: "Earnings · Cash flow · Value",
        ko: "실적 · 현금흐름 · 가치평가",
      },
    },
    {
      id: "risk",
      position: OFFICE_ENTITY_GEOMETRY.roomSigns.risk,
      size: OFFICE_ENTITY_GEOMETRY.roomSigns.risk,
      accent: 0x8b6f93,
      name: { en: "RISK", ko: "리스크 분석" },
      scope: {
        en: "Policy · Downside · Scenarios",
        ko: "정책 · 하방 · 시나리오",
      },
    },
  ] satisfies readonly OfficeRoomPlaqueSpec[]);

export function localizedRoomPlaque(
  spec: OfficeRoomPlaqueSpec,
  locale: Locale,
): { readonly name: string; readonly scope: string } {
  return Object.freeze({ name: spec.name[locale], scope: spec.scope[locale] });
}
