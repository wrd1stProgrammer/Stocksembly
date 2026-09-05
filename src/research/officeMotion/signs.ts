import type { AppLocale } from "../../lib/i18n";
import { panel, text } from "./canvasPrimitives";

type SignKey =
  | "office.room.market"
  | "office.room.chair"
  | "office.room.company"
  | "office.room.financial"
  | "office.room.risk";
type SignCopy = readonly [title: string, scope: string];
const translations: Readonly<
  Record<AppLocale, Readonly<Record<SignKey, SignCopy>>>
> = {
  ko: {
    "office.room.market": ["시장 분석", "시장 · 뉴스 · 거시경제"],
    "office.room.chair": ["리서치 의장", "증거 감사 · 최종 종합"],
    "office.room.company": ["기업 분석", "제품 · 경쟁력"],
    "office.room.financial": ["재무 분석", "실적 · 현금흐름 · 가치평가"],
    "office.room.risk": ["리스크 분석", "정책 · 하방 · 시나리오"],
  },
  en: {
    "office.room.market": ["Market analysis", "Markets · News · Macro"],
    "office.room.chair": ["Research chair", "Evidence audit · Synthesis"],
    "office.room.company": ["Company analysis", "Products · Competitive edge"],
    "office.room.financial": [
      "Financial analysis",
      "Earnings · Cash flow · Value",
    ],
    "office.room.risk": ["Risk analysis", "Policy · Downside · Scenarios"],
  },
  ja: {
    "office.room.market": ["市場分析", "市場 · ニュース · マクロ経済"],
    "office.room.chair": ["リサーチ議長", "根拠の検証 · 総合判断"],
    "office.room.company": ["企業分析", "製品 · 競争力"],
    "office.room.financial": ["財務分析", "業績 · キャッシュフロー · 価値"],
    "office.room.risk": ["リスク分析", "政策 · 下振れ · シナリオ"],
  },
  "zh-TW": {
    "office.room.market": ["市場分析", "市場 · 新聞 · 總體經濟"],
    "office.room.chair": ["研究主席", "證據審核 · 綜合判斷"],
    "office.room.company": ["企業分析", "產品 · 競爭力"],
    "office.room.financial": ["財務分析", "業績 · 現金流 · 估值"],
    "office.room.risk": ["風險分析", "政策 · 下行風險 · 情境"],
  },
  es: {
    "office.room.market": [
      "Análisis de mercado",
      "Mercados · Noticias · Macroeconomía",
    ],
    "office.room.chair": [
      "Dirección de análisis",
      "Revisión de pruebas · Síntesis",
    ],
    "office.room.company": [
      "Análisis empresarial",
      "Productos · Ventaja competitiva",
    ],
    "office.room.financial": [
      "Análisis financiero",
      "Resultados · Flujo de caja · Valor",
    ],
    "office.room.risk": [
      "Análisis de riesgos",
      "Políticas · Pérdidas · Escenarios",
    ],
  },
  "pt-BR": {
    "office.room.market": [
      "Análise de mercado",
      "Mercados · Notícias · Macroeconomia",
    ],
    "office.room.chair": [
      "Direção de pesquisa",
      "Revisão de evidências · Síntese",
    ],
    "office.room.company": [
      "Análise de empresas",
      "Produtos · Vantagem competitiva",
    ],
    "office.room.financial": [
      "Análise financeira",
      "Resultados · Fluxo de caixa · Valor",
    ],
    "office.room.risk": ["Análise de riscos", "Políticas · Perdas · Cenários"],
  },
  de: {
    "office.room.market": [
      "Marktanalyse",
      "Märkte · Nachrichten · Makroökonomie",
    ],
    "office.room.chair": ["Analyseleitung", "Belegprüfung · Zusammenführung"],
    "office.room.company": [
      "Unternehmensanalyse",
      "Produkte · Wettbewerbsvorteile",
    ],
    "office.room.financial": [
      "Finanzanalyse",
      "Ergebnisse · Cashflow · Bewertung",
    ],
    "office.room.risk": [
      "Risikoanalyse",
      "Politik · Verlustrisiken · Szenarien",
    ],
  },
  fr: {
    "office.room.market": [
      "Analyse de marché",
      "Marchés · Actualités · Macroéconomie",
    ],
    "office.room.chair": [
      "Direction de recherche",
      "Examen des preuves · Synthèse",
    ],
    "office.room.company": [
      "Analyse d’entreprise",
      "Produits · Avantage concurrentiel",
    ],
    "office.room.financial": [
      "Analyse financière",
      "Résultats · Trésorerie · Valorisation",
    ],
    "office.room.risk": [
      "Analyse des risques",
      "Politiques · Baisse · Scénarios",
    ],
  },
};
const SIGN = { insetX: 12, insetY: 32, width: 232, height: 54 } as const;
const signs: readonly {
  wallLeft: number;
  wallTop: number;
  key: SignKey;
  color: string;
}[] = [
  { wallLeft: 60, wallTop: 20, key: "office.room.market", color: "#81b6cf" },
  { wallLeft: 576, wallTop: 20, key: "office.room.chair", color: "#e0bb78" },
  { wallLeft: 944, wallTop: 20, key: "office.room.company", color: "#7ab4a7" },
  {
    wallLeft: 60,
    wallTop: 565,
    key: "office.room.financial",
    color: "#c8a778",
  },
  { wallLeft: 742, wallTop: 565, key: "office.room.risk", color: "#b39ac7" },
];
export function drawRoomSigns(
  ctx: CanvasRenderingContext2D,
  locale: AppLocale,
): void {
  for (const sign of signs) {
    const x = sign.wallLeft + SIGN.insetX;
    const y = sign.wallTop + SIGN.insetY;
    const [title, scope] = translations[locale][sign.key];
    panel(ctx, x, y + 3, SIGN.width, SIGN.height, 6, "#101e2540");
    panel(ctx, x, y, SIGN.width, SIGN.height, 6, "#24363bef", "#a7b1a48a");
    panel(ctx, x + 11, y + 12, 4, 30, 2, sign.color);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 24, y + 5, SIGN.width - 31, SIGN.height - 10);
    ctx.clip();
    ctx.font = "650 16px Pretendard, sans-serif";
    const titleSize = Math.min(
      16,
      (16 * (SIGN.width - 36)) / Math.max(1, ctx.measureText(title).width),
    );
    text(ctx, title, x + 26, y + 23, titleSize, "#f2f0e5", 650);
    ctx.font = "500 10.5px Pretendard, sans-serif";
    const scopeSize = Math.min(
      10.5,
      (10.5 * (SIGN.width - 36)) / Math.max(1, ctx.measureText(scope).width),
    );
    text(ctx, scope, x + 26, y + 42, scopeSize, "#bac5bf", 500);
    ctx.restore();
  }
}
