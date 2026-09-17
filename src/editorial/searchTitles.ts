import type { AppLocale } from "../lib/supportedLocales";
import { type EditorialSlug, editorialSlugs } from "./types";

// Authored search labels keep titles complete; article headings retain their detail.
const titles = {
  en: [
    "How to Read a 10-K",
    "Earnings Quality and Cash Conversion",
    "How to Choose Comparable Companies",
    "Bull, Base and Bear Case Analysis",
    "Counterarguments in AI Stock Research",
    "Free Cash Flow: Formula and Limits",
    "EV/EBITDA: Calculation and Comparison",
    "Earnings Guidance Explained",
    "Share Dilution and Per-Share Value",
    "Margin of Safety Explained",
  ],
  ko: [
    "10-K 사업보고서 읽는 법",
    "이익의 질과 현금 전환 분석",
    "비교 기업 선정 방법",
    "상승·기준·하락 시나리오 분석",
    "AI 주식 리서치의 반론 검증",
    "잉여현금흐름: 계산과 한계",
    "EV/EBITDA: 계산과 기업 비교",
    "실적 가이던스 읽는 법",
    "주식 희석과 주당 가치",
    "안전마진의 의미와 계산",
  ],
  ja: [
    "10-Kの読み方",
    "利益の質とキャッシュ転換",
    "比較対象企業の選び方",
    "強気・基本・弱気シナリオ分析",
    "AI株式調査で反論を検証する",
    "フリーキャッシュフローの計算と限界",
    "EV/EBITDAの計算と企業比較",
    "業績ガイダンスの読み方",
    "株式希薄化と1株当たり価値",
    "安全余裕率の意味と計算",
  ],
  "zh-TW": [
    "如何閱讀10-K年報",
    "盈餘品質與現金轉換",
    "如何選擇可比公司",
    "樂觀、基準與悲觀情境分析",
    "AI股票研究中的反論驗證",
    "自由現金流：計算與限制",
    "EV/EBITDA：計算與企業比較",
    "如何解讀財測指引",
    "股權稀釋與每股價值",
    "安全邊際的意義與計算",
  ],
  es: [
    "Cómo leer un informe 10-K",
    "Calidad del beneficio y conversión de caja",
    "Cómo elegir empresas comparables",
    "Análisis de escenarios alcista, base y bajista",
    "Contraargumentos en el análisis con IA",
    "Flujo de caja libre: cálculo y límites",
    "EV/EBITDA: cálculo y comparación",
    "Cómo leer las previsiones de resultados",
    "Dilución y valor por acción",
    "Margen de seguridad: concepto y cálculo",
  ],
  "pt-BR": [
    "Como ler um relatório 10-K",
    "Qualidade do lucro e conversão em caixa",
    "Como escolher empresas comparáveis",
    "Cenários otimista, base e pessimista",
    "Contrapontos na análise de ações com IA",
    "Fluxo de caixa livre: cálculo e limites",
    "EV/EBITDA: cálculo e comparação",
    "Como interpretar o guidance",
    "Diluição e valor por ação",
    "Margem de segurança: conceito e cálculo",
  ],
  de: [
    "10-K-Berichte richtig lesen",
    "Ergebnisqualität und Cash Conversion",
    "Vergleichbare Unternehmen auswählen",
    "Bull-, Base- und Bear-Case-Analyse",
    "Gegenargumente in der KI-Aktienanalyse",
    "Free Cashflow: Berechnung und Grenzen",
    "EV/EBITDA: Berechnung und Vergleich",
    "Gewinnprognosen richtig einordnen",
    "Aktienverwässerung und Wert je Aktie",
    "Sicherheitsmarge: Bedeutung und Berechnung",
  ],
  fr: [
    "Comment lire un rapport 10-K",
    "Qualité des bénéfices et conversion en cash",
    "Comment choisir des sociétés comparables",
    "Scénarios haussier, central et baissier",
    "Contre-arguments dans l’analyse par IA",
    "Flux de trésorerie libre : calcul et limites",
    "EV/EBITDA : calcul et comparaison",
    "Comprendre les prévisions de résultats",
    "Dilution et valeur par action",
    "Marge de sécurité : définition et calcul",
  ],
} satisfies Record<AppLocale, readonly string[]>;

export function editorialSearchTitle(
  locale: AppLocale,
  slug: EditorialSlug,
): string {
  const title = titles[locale][editorialSlugs.indexOf(slug)];
  if (title === undefined)
    throw new RangeError(`Missing editorial search title: ${locale}/${slug}`);
  return title;
}
