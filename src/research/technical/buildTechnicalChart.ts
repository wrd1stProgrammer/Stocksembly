import { hashCanonical } from "../domain/contractHelpers";
import {
  type ChartBar,
  ChartCommentarySchema,
  TECHNICAL_TIMEFRAMES,
  type TechnicalChartFrame,
  type TechnicalChartSnapshot,
  TechnicalChartSnapshotSchema,
  type TechnicalTimeframe,
} from "../domain/technicalChart";
import type { InsightSentryBarSet } from "../server/data/insightsentry/insightSentryMarket";
import { averageTrueRange, deriveChartDrawings } from "./chartDrawings";
import { drawingCurrentRange } from "./chartPresentation";
import { closedChartBars, weeklyFromDaily } from "./chartSessions";

export const FRAME_NAMES = {
  "1h": { en: "1-hour", ko: "1시간" },
  "4h": { en: "4-hour", ko: "4시간" },
  "1d": { en: "Daily", ko: "일봉" },
  "1w": { en: "Weekly", ko: "주봉" },
} as const;
export const REGIME_NAMES = {
  rising: { en: "Rising structure", ko: "상승 구조" },
  falling: { en: "Falling structure", ko: "하락 구조" },
  range: { en: "Mixed / range", ko: "혼조·범위 확인" },
  unknown: { en: "Insufficient history", ko: "이력 부족" },
} as const;
function movingAverages(
  bars: readonly ChartBar[],
): TechnicalChartFrame["averages"] {
  return ([20, 50, 200] as const).flatMap((period) => {
    if (bars.length < period) return [];
    let sum = 0;
    const points = [];
    for (let index = 0; index < bars.length; index++) {
      sum += bars[index]?.close ?? 0;
      if (index >= period) sum -= bars[index - period]?.close ?? 0;
      if (index >= period - 1) points.push({ index, price: sum / period });
    }
    return [{ period, points }];
  });
}
function frame(
  timeframe: TechnicalTimeframe,
  bars: readonly ChartBar[],
  requestedBars: number,
  excludedOpenBars: number,
  origin: TechnicalChartFrame["origin"],
): TechnicalChartFrame {
  const averages = movingAverages(bars);
  const last = bars.at(-1);
  const fast = averages.find((item) => item.period === 20)?.points;
  const slow = averages
    .find((item) => item.period === 50)
    ?.points.at(-1)?.price;
  const latestFast = fast?.at(-1)?.price;
  const priorFast = fast?.at(-6)?.price;
  const regime =
    !last || !latestFast || !slow || !priorFast
      ? "unknown"
      : last.close > latestFast && latestFast > slow && latestFast > priorFast
        ? "rising"
        : last.close < latestFast && latestFast < slow && latestFast < priorFast
          ? "falling"
          : "range";
  const drawings = deriveChartDrawings(bars, timeframe);
  const supports = drawings
    .filter((item) => item.kind === "support")
    .sort((a, b) => b.high - a.high);
  const resistances = drawings
    .filter((item) => item.kind === "resistance")
    .sort((a, b) => a.low - b.low);
  const support = supports[0];
  const resistance = resistances[0];
  const atr = averageTrueRange(bars);
  const volumeAverage =
    bars.length >= 21
      ? bars.slice(-21, -1).reduce((sum, bar) => sum + bar.volume, 0) / 20
      : 0;
  const scenarios: TechnicalChartFrame["scenarios"] =
    !last || bars.length < 20
      ? []
      : [
          {
            direction: "up",
            boundary: resistance?.high ?? last.high,
            invalidation: support?.low ?? last.low,
            ...(resistances[1] &&
            atr !== undefined &&
            resistances[1].low - last.close <= atr * 3
              ? { target: resistances[1].low }
              : {}),
            drawingIds: [resistance?.id, support?.id].filter(
              (id): id is string => id !== undefined,
            ),
          },
          {
            direction: "down",
            boundary: support?.low ?? last.low,
            invalidation: resistance?.high ?? last.high,
            ...(supports[1] &&
            atr !== undefined &&
            last.close - supports[1].high <= atr * 3
              ? { target: supports[1].high }
              : {}),
            drawingIds: [support?.id, resistance?.id].filter(
              (id): id is string => id !== undefined,
            ),
          },
        ];
  return {
    timeframe,
    status:
      bars.length < 20
        ? "unavailable"
        : bars.length < requestedBars || origin === "derived_from_daily"
          ? "partial"
          : "ready",
    origin,
    bars,
    requestedBars,
    excludedOpenBars,
    regime,
    averages,
    drawings,
    scenarios,
    ...(atr === undefined ? {} : { atr14: atr }),
    ...(last && volumeAverage > 0
      ? { volumeRatio20: last.volume / volumeAverage }
      : {}),
    observation: {
      en: `${FRAME_NAMES[timeframe].en}: ${REGIME_NAMES[regime].en.toLowerCase()}. ${regime === "rising" ? "Price is above rising short and medium averages; watch whether the next closed candle holds the nearest support." : regime === "falling" ? "Price is below falling short and medium averages; a bounce needs a closing reclaim of resistance." : "The averages do not establish one direction. Let a closing break of the nearby range confirm the next move."}`,
      ko: `${FRAME_NAMES[timeframe].ko}은 ${REGIME_NAMES[regime].ko}입니다. ${regime === "rising" ? "상승하는 단기·중기 이평 위에 있습니다. 다음 확정봉이 가까운 지지 구간을 유지하는지 확인합니다." : regime === "falling" ? "하락하는 단기·중기 이평 아래에 있습니다. 반등은 저항을 종가로 회복해야 의미가 커집니다." : "이평 정렬만으로 방향을 확정하기 어렵습니다. 가까운 범위를 종가로 벗어나는지 먼저 확인합니다."}`,
    },
    ...(bars.length < 50
      ? {
          limitation: {
            en: "History is too short for the full trend assessment. Unwarmed averages are omitted.",
            ko: "전체 추세 판단에 필요한 이력이 부족합니다. 계산 기간을 채우지 못한 이평은 생략했습니다.",
          },
        }
      : origin === "derived_from_daily"
        ? {
            limitation: {
              en: "Weekly candles reconstructed from complete daily trading weeks.",
              ko: "빠진 거래일이 없는 완결된 일봉 묶음으로 주봉을 구성했습니다.",
            },
          }
        : {}),
  };
}
function synthesis(frames: readonly TechnicalChartFrame[]) {
  const weekly = frames.find((item) => item.timeframe === "1w");
  const daily = frames.find((item) => item.timeframe === "1d");
  const setup = frames.find((item) => item.timeframe === "4h");
  const trigger = frames.find((item) => item.timeframe === "1h");
  const state = (item: TechnicalChartFrame | undefined, locale: "en" | "ko") =>
    REGIME_NAMES[item?.regime ?? "unknown"][locale];
  const conflict =
    weekly?.regime !== daily?.regime || daily?.regime !== setup?.regime;
  return {
    en: `Weekly: ${state(weekly, "en").toLowerCase()}; daily: ${state(daily, "en").toLowerCase()}. ${conflict ? "The larger structure and the nearer setup are not aligned: treat an hourly rebound as a local reaction until the four-hour candle confirms a reclaim." : "The larger structure and the nearer setup align; the hourly candle supplies the confirmation, not an independent vote."} Four-hour: ${state(setup, "en").toLowerCase()}; hourly: ${state(trigger, "en").toLowerCase()}. Use the closing conditions below to distinguish continuation from failure.`,
    ko: `주봉은 ${state(weekly, "ko")}, 일봉은 ${state(daily, "ko")}입니다. ${conflict ? "큰 흐름과 가까운 셋업이 일치하지 않습니다. 한 시간 반등은 단기 반응으로 보고, 네 시간 봉의 종가 회복이 확인돼야 의미를 확대합니다." : "큰 흐름과 가까운 셋업이 일치합니다. 한 시간 봉은 별도의 한 표가 아니라 진입 판단을 확인하는 역할입니다."} 네 시간은 ${state(setup, "ko")}, 한 시간은 ${state(trigger, "ko")}입니다. 아래 종가 조건으로 흐름 지속과 실패를 구분합니다.`,
  };
}
export function buildTechnicalChart(input: {
  symbol: string;
  asOf: string;
  sets: readonly InsightSentryBarSet[];
}): TechnicalChartSnapshot {
  const dailySet = input.sets.find((set) => set.timeframe === "1d");
  const daily = closedChartBars(dailySet?.bars ?? [], "1d", input.asOf);
  const frames = TECHNICAL_TIMEFRAMES.map((timeframe) => {
    const set = input.sets.find((item) => item.timeframe === timeframe);
    const maxBars = timeframe === "1d" ? 1000 : 500;
    const closed = closedChartBars(
      set?.bars ?? [],
      timeframe,
      input.asOf,
    ).slice(-maxBars);
    const derived =
      timeframe === "1w" && closed.length < 20
        ? weeklyFromDaily(daily, input.asOf).slice(-500)
        : [];
    const useDerived = derived.length > closed.length;
    return frame(
      timeframe,
      useDerived ? derived : closed,
      maxBars,
      (set?.bars.length ?? 0) - closed.length,
      useDerived ? "derived_from_daily" : "native",
    );
  });
  return TechnicalChartSnapshotSchema.parse({
    schemaVersion: "technical-chart-v1",
    algorithmVersion: "structure-v1",
    symbol: input.symbol,
    analysisAsOf: input.asOf,
    provider: "InsightSentry",
    timezone: "America/New_York",
    adjustment: "split-adjusted; dividends-unadjusted; regular-session",
    dataHash: hashCanonical(
      frames.map((item) => ({ timeframe: item.timeframe, bars: item.bars })),
    ),
    status: frames.every((item) => item.status === "unavailable")
      ? "unavailable"
      : frames.every((item) => item.status === "ready")
        ? "ready"
        : "partial",
    frames,
    synthesis: synthesis(frames),
    commentarySource: "calculated",
  });
}
export function applyJuneChartCommentary(
  snapshot: TechnicalChartSnapshot,
  raw: unknown,
): TechnicalChartSnapshot {
  if (typeof raw !== "string" || raw.length > 16000) return snapshot;
  try {
    const result = ChartCommentarySchema.safeParse(JSON.parse(raw));
    if (!result.success) return snapshot;
    const mergeText = (
      proposed: { en?: string | undefined; ko?: string | undefined },
      fallback: { en: string; ko: string },
    ) => {
      const merged = { ...fallback };
      for (const locale of ["en", "ko"] as const) {
        const text = proposed[locale];
        if (
          typeof text === "string" &&
          text.trim().length >= (locale === "en" ? 20 : 10) &&
          !/[0-9%$]|guarantee|win rate|승률|확실한 수익/i.test(text) &&
          !/[\p{Script=Bengali}\p{Script=Devanagari}\p{Script=Cyrillic}\p{Script=Arabic}]/u.test(
            text,
          )
        )
          merged[locale] = text;
      }
      return merged.en === fallback.en && merged.ko === fallback.ko
        ? fallback
        : merged;
    };
    const commentary = result.data;
    const frames = snapshot.frames.map((item) => {
      const detail = commentary.frames.find(
        (candidate) => candidate.timeframe === item.timeframe,
      );
      if (
        !detail ||
        !detail.focusDrawingIds.every((id) =>
          item.drawings.some((drawing) => drawing.id === id),
        )
      )
        return item;
      const observation = mergeText(detail.observation, item.observation);
      if (observation === item.observation) return item;
      const priorities = new Map(
        detail.focusDrawingIds.map((id, index) => [id, index]),
      );
      return {
        ...item,
        drawings: [...item.drawings].sort(
          (left, right) =>
            (priorities.get(left.id) ?? 99) - (priorities.get(right.id) ?? 99),
        ),
        observation,
      };
    });
    const synthesis = mergeText(commentary.synthesis, snapshot.synthesis);
    return {
      ...snapshot,
      frames,
      synthesis,
      commentarySource:
        synthesis !== snapshot.synthesis ||
        frames.some((item, index) => item !== snapshot.frames[index])
          ? "june"
          : "calculated",
    };
  } catch {
    return snapshot;
  }
}
export function technicalChartPromptSummary(snapshot: TechnicalChartSnapshot) {
  return {
    analysisAsOf: snapshot.analysisAsOf,
    frames: snapshot.frames.map((item) => ({
      timeframe: item.timeframe,
      status: item.status,
      regime: item.regime,
      lastClosed: item.bars.at(-1),
      atr14: item.atr14,
      volumeRatio20: item.volumeRatio20,
      averages: item.averages.map((average) => ({
        period: average.period,
        latest: average.points.at(-1)?.price,
      })),
      drawings: item.drawings.map((drawing) => ({
        id: drawing.id,
        kind: drawing.kind,
        ...drawingCurrentRange(drawing, item),
        strength: drawing.strength,
        reason: drawing.reason.en,
      })),
      scenarios: item.scenarios,
    })),
  };
}
