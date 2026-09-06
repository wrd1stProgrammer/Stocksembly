import type {
  ChartDrawing,
  TechnicalChartFrame,
} from "../domain/technicalChart";
import { linePrice } from "./chartDrawings";

export const FRAME_NAMES = {
  "1h": { en: "1 hour", ko: "1시간" },
  "4h": { en: "4 hours", ko: "4시간" },
  "1d": { en: "Daily", ko: "일봉" },
  "1w": { en: "Weekly", ko: "주봉" },
} as const;
export const REGIME_NAMES = {
  rising: { en: "Rising structure", ko: "상승 구조" },
  falling: { en: "Falling structure", ko: "하락 구조" },
  range: { en: "Mixed / range", ko: "혼조·범위 확인" },
  unknown: { en: "Insufficient history", ko: "이력 부족" },
} as const;
export const DRAWING_NAMES = {
  support: { en: "Support", ko: "지지" },
  resistance: { en: "Resistance", ko: "저항" },
  trend: { en: "Trend line", ko: "추세선" },
  channel: { en: "Channel", ko: "채널" },
  order_block: { en: "Order-block candidate", ko: "오더블록 후보" },
} as const;
export const VISIBLE_BARS = {
  "1h": 120,
  "4h": 120,
  "1d": 180,
  "1w": 156,
} as const;
export const futureBarCount = (timeframe: TechnicalChartFrame["timeframe"]) =>
  Math.ceil(VISIBLE_BARS[timeframe] / 3);
export const chartPrice = (price: number) =>
  price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: price < 1 ? 4 : 2,
  });
export function drawingSegments(drawing: ChartDrawing, lastIndex: number) {
  const first = drawing.anchors[0];
  if (!first) return [];
  if (drawing.kind === "trend" || drawing.kind === "channel") {
    const main = {
      from: first.index,
      to: lastIndex,
      startPrice: linePrice(drawing, first.index),
      endPrice: linePrice(drawing, lastIndex),
    };
    return [
      main,
      ...(drawing.parallelOffset === undefined
        ? []
        : [
            {
              ...main,
              startPrice: main.startPrice + drawing.parallelOffset,
              endPrice: main.endPrice + drawing.parallelOffset,
            },
          ]),
    ];
  }
  return [
    {
      from: first.index,
      to: lastIndex,
      startPrice: drawing.low,
      endPrice: drawing.low,
    },
    {
      from: first.index,
      to: lastIndex,
      startPrice: drawing.high,
      endPrice: drawing.high,
    },
  ];
}
export function scenarioText(
  frame: TechnicalChartFrame,
  direction: "up" | "down",
  locale: "en" | "ko",
) {
  const scenario = frame.scenarios.find((item) => item.direction === direction);
  if (!scenario) return "";
  const boundary = chartPrice(scenario.boundary);
  const invalidation = chartPrice(scenario.invalidation);
  if (locale === "ko")
    return `다음 ${FRAME_NAMES[frame.timeframe].ko} 종가가 ${boundary} ${direction === "up" ? "위를 회복·유지" : "아래로 이탈"}하면 ${scenario.target === undefined ? "돌파 구간의 재시험을 확인" : `${chartPrice(scenario.target)} 구간의 반응을 확인`}합니다. ${invalidation} ${direction === "up" ? "아래" : "위"} 종가는 이 해석을 무효화합니다.`;
  return `A ${FRAME_NAMES[frame.timeframe].en.toLowerCase()} close ${direction === "up" ? "above" : "below"} ${boundary} calls for ${scenario.target === undefined ? "a retest of the break" : `a reaction at ${chartPrice(scenario.target)}`}. A close ${direction === "up" ? "below" : "above"} ${invalidation} invalidates this path.`;
}

export function drawingCurrentRange(
  drawing: ChartDrawing,
  frame: TechnicalChartFrame,
) {
  if (drawing.kind !== "trend" && drawing.kind !== "channel")
    return { low: drawing.low, high: drawing.high };
  const price = linePrice(drawing, frame.bars.length - 1);
  const other = price + (drawing.parallelOffset ?? 0);
  return { low: Math.min(price, other), high: Math.max(price, other) };
}
