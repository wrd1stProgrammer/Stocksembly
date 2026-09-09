import type { Content } from "pdfmake/interfaces";
import type {
  TechnicalChartFrame,
  TechnicalChartSnapshot,
} from "../domain/technicalChart";
import {
  chartPrice,
  drawingSegments,
  FRAME_NAMES,
  futureBarCount,
  REGIME_NAMES,
  VISIBLE_BARS,
} from "../technical/chartPresentation";

const up = "#28795d";
const down = "#b64d5c";
export function technicalChartSvg(
  frame: TechnicalChartFrame,
  width = 500,
  height = 310,
): string {
  const start = Math.max(0, frame.bars.length - VISIBLE_BARS[frame.timeframe]);
  const visible = frame.bars.slice(start);
  if (!visible.length)
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"></svg>`;
  const right = width - 47;
  const futureBars = futureBarCount(frame.timeframe);
  const drawingEnd = frame.bars.length - 1 + futureBars;
  const bottom = height - 24;
  const low = Math.min(...visible.map((bar) => bar.low));
  const high = Math.max(...visible.map((bar) => bar.high));
  const range = Math.max(high - low, high * 0.01);
  const min = low - range * 0.06;
  const max = high + range * 0.09;
  const x = (index: number) =>
    5 + ((index - start) * (right - 5)) / (drawingEnd - start);
  const y = (price: number) =>
    6 + ((max - price) / (max - min)) * (bottom - 37);
  const maxVolume = Math.max(1, ...visible.map((bar) => bar.volume));
  const bodyWidth = Math.max(0.8, ((right - 5) / (drawingEnd - start)) * 0.7);
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><clipPath id="plot"><rect x="0" y="0" width="${right}" height="${bottom}"/></clipPath></defs><rect width="${width}" height="${height}" fill="#fbfaf6"/>`,
  ];
  for (let step = 0; step < 5; step++) {
    const price = min + ((max - min) * step) / 4;
    const py = y(price);
    parts.push(
      `<line x1="0" y1="${py}" x2="${right}" y2="${py}" stroke="#e1e1da" stroke-width="0.5"/><text x="${right + 5}" y="${py + 3}" font-family="Helvetica" font-size="9" fill="#666666">${chartPrice(price)}</text>`,
    );
  }
  parts.push(
    `<g clip-path="url(#plot)"><rect x="${x(frame.bars.length)}" y="0" width="${right - x(frame.bars.length)}" height="${bottom}" fill="#e8e8e0" fill-opacity="0.5"/>`,
  );
  for (const [offset, bar] of visible.entries()) {
    const px = x(start + offset);
    const color = bar.close >= bar.open ? up : down;
    parts.push(
      `<line x1="${px}" y1="${y(bar.high)}" x2="${px}" y2="${y(bar.low)}" stroke="${color}" stroke-width="0.6"/><rect x="${px - bodyWidth / 2}" y="${Math.min(y(bar.open), y(bar.close))}" width="${bodyWidth}" height="${Math.max(0.7, Math.abs(y(bar.open) - y(bar.close)))}" fill="${color}"/><rect x="${px - bodyWidth / 2}" y="${bottom - (bar.volume / maxVolume) * 22}" width="${bodyWidth}" height="${(bar.volume / maxVolume) * 22}" fill="${color}" fill-opacity="0.22"/>`,
    );
  }
  for (const drawing of frame.drawings) {
    const color = drawing.side === "demand" ? up : down;
    const segments = drawingSegments(drawing, drawingEnd);
    const first = segments[0];
    if (!first) continue;
    if (drawing.kind !== "trend" && drawing.kind !== "channel")
      parts.push(
        `<rect x="${x(first.from)}" y="${y(drawing.high)}" width="${x(first.to) - x(first.from)}" height="${Math.max(1, y(drawing.low) - y(drawing.high))}" fill="${color}" fill-opacity="0.07"/>`,
      );
    for (const segment of segments)
      parts.push(
        `<line x1="${x(segment.from)}" y1="${y(segment.startPrice)}" x2="${x(segment.to)}" y2="${y(segment.endPrice)}" stroke="${color}" stroke-width="0.8" ${drawing.kind !== "support" && drawing.kind !== "resistance" && drawing.strength === "tentative" ? 'stroke-dasharray="4 3"' : ""}/>`,
      );
  }
  const last = frame.bars.at(-1);
  if (last)
    for (const scenario of frame.scenarios)
      parts.push(
        `<line x1="${x(frame.bars.length)}" y1="${y(last.close)}" x2="${x(frame.bars.length + 5)}" y2="${y(scenario.boundary)}" stroke="${scenario.direction === "up" ? up : down}" stroke-width="1" stroke-dasharray="2 3"/>`,
      );
  if (last) {
    const color = last.close >= last.open ? up : down;
    parts.push(
      `<line x1="0" y1="${y(last.close)}" x2="${right}" y2="${y(last.close)}" stroke="${color}" stroke-width="1" stroke-dasharray="2 2"/>`,
    );
  }
  parts.push("</g>");
  if (last) {
    const color = last.close >= last.open ? up : down;
    parts.push(
      `<rect x="${right}" y="${y(last.close) - 8}" width="47" height="16" fill="${color}"/><text x="${right + 3}" y="${y(last.close) + 3}" font-family="Helvetica" font-size="9" fill="#ffffff">${chartPrice(last.close)}</text>`,
    );
  }
  for (const offset of [
    0,
    Math.floor(visible.length / 2),
    visible.length - 1,
  ]) {
    const bar = visible[offset];
    if (!bar) continue;
    parts.push(
      `<text x="${x(start + offset)}" y="${height - 7}" font-family="Helvetica" font-size="9" fill="#666666" text-anchor="${offset === 0 ? "start" : "middle"}">${bar.timestamp.slice(2, 10)}</text>`,
    );
  }
  parts.push("</svg>");
  return parts.join("");
}
function card(frame: TechnicalChartFrame, locale: "en" | "ko"): Content {
  const ko = locale === "ko";
  const last = frame.bars.at(-1);
  const levels = frame.drawings
    .filter((item) => item.kind === "support" || item.kind === "resistance")
    .map(
      (item) =>
        `${item.kind === "support" ? "S" : "R"} ${chartPrice(item.low)}${item.high - item.low > 0.005 ? `–${chartPrice(item.high)}` : ""}`,
    )
    .join(" · ");
  const conditions = frame.scenarios.map(
    (scenario) =>
      `${scenario.direction === "up" ? (ko ? "상향" : "Up") : ko ? "하향" : "Down"}: ${chartPrice(scenario.boundary)} ${scenario.direction === "up" ? (ko ? "위" : "above") : ko ? "아래" : "below"} ${ko ? "종가 확인" : "close"} / ${ko ? "무효화" : "invalidated"} ${chartPrice(scenario.invalidation)}`,
  );
  return {
    stack: [
      {
        columns: [
          {
            text: FRAME_NAMES[frame.timeframe][locale],
            bold: true,
            fontSize: 12,
          },
          {
            text: last ? `${chartPrice(last.close)} USD` : "",
            alignment: "right",
            fontSize: 9,
          },
        ],
      },
      {
        text: REGIME_NAMES[frame.regime][locale],
        fontSize: 8,
        color: "#666666",
        margin: [0, 3, 0, 8],
      },
      ...(frame.status === "unavailable"
        ? [
            {
              text: ko
                ? "확정봉 이력 부족"
                : "Insufficient closed-candle history",
              margin: [0, 30, 0, 30],
            } as Content,
          ]
        : [{ svg: technicalChartSvg(frame), width: 252 } as Content]),
      {
        text: frame.observation[locale],
        fontSize: 7,
        lineHeight: 1.25,
        margin: [0, 6, 0, 5],
      },
      { text: levels, fontSize: 6.7, color: "#666666", margin: [0, 0, 0, 5] },
      ...conditions.map(
        (text) => ({ text, fontSize: 7, margin: [0, 0, 0, 3] }) as Content,
      ),
    ],
  };
}
export function technicalChartPdfPage(
  chart: TechnicalChartSnapshot,
  locale: "en" | "ko",
): Content {
  const ko = locale === "ko";
  return {
    pageBreak: "before",
    stack: [
      {
        text: `02 / JUNE · ${ko ? "차트 리서치" : "CHART RESEARCH"}`,
        fontSize: 8,
        color: "#555555",
        margin: [0, 0, 0, 8],
      },
      {
        text: ko
          ? "차트 구조와 다음 움직임"
          : "Chart structure & the next move",
        fontSize: 21,
        bold: true,
        margin: [0, 0, 0, 12],
      },
      {
        text: chart.synthesis[locale],
        fontSize: 8,
        lineHeight: 1.35,
        margin: [0, 0, 0, 18],
      },
      {
        columns: chart.frames.slice(0, 2).map((frame) => card(frame, locale)),
        columnGap: 16,
        margin: [0, 0, 0, 20],
      },
      {
        columns: chart.frames.slice(2, 4).map((frame) => card(frame, locale)),
        columnGap: 16,
      },
      {
        text: ko
          ? "점선은 다음 확정봉의 확인 조건이며 미래 캔들이 아닙니다. 오더블록은 가격 반응 후보입니다."
          : "Dotted paths are closing conditions, not future candles. Order blocks are price-reaction candidates.",
        fontSize: 7,
        color: "#666666",
        margin: [0, 16, 0, 5],
      },
      {
        text: `InsightSentry · ${chart.analysisAsOf.slice(0, 16).replace("T", " ")} UTC · ${ko ? "정규장 · 분할 조정 · 배당 미조정" : "Regular session · Split adjusted · Dividends unadjusted"}`,
        fontSize: 6.7,
        color: "#666666",
      },
    ],
  };
}
