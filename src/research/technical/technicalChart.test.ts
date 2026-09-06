import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ChartBar } from "../domain/technicalChart";
import { technicalChartSvg } from "../pdf/technicalChartSvg";
import type { InsightSentryBarSet } from "../server/data/insightsentry/insightSentryMarket";
import { SpecialistMemoOutputSchema } from "../workflow/specialistRoundContracts";
import {
  applyJuneChartCommentary,
  buildTechnicalChart,
} from "./buildTechnicalChart";
import { confirmedPivots, linePrice } from "./chartDrawings";
import { barClosedAt, closedChartBars, weeklyFromDaily } from "./chartSessions";

function dailySet(count = 240): InsightSentryBarSet {
  const bars: InsightSentryBarSet["bars"][number][] = [];
  let day = new Date("2025-01-02T14:30:00Z");
  while (bars.length < count) {
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) {
      const i = bars.length;
      const open = 100 + i * 0.12 + Math.sin(i / 5) * 4;
      bars.push({
        timestamp: day.toISOString(),
        timeframe: "1d" as const,
        open,
        high: open + 2,
        low: open - 2,
        close: open + Math.sin(i) * 0.8,
        volume: 1000 + i,
      });
    }
    day = new Date(day.getTime() + 86400000);
  }
  return {
    timeframe: "1d",
    bars,
    coverage: {
      observedStart: bars[0]?.timestamp ?? "",
      observedEnd: bars.at(-1)?.timestamp ?? "",
      barCount: bars.length,
      requestedBarCount: 1000,
      partial: true,
    },
  };
}
describe("technical chart evidence boundaries", () => {
  it("keeps every wire-schema property required while allowing absent chart enrichment as null", () => {
    const schema = z.toJSONSchema(SpecialistMemoOutputSchema);
    expect(schema.required?.slice().sort()).toEqual(
      Object.keys(schema.properties ?? {}).sort(),
    );
    expect(
      SpecialistMemoOutputSchema.unwrap().shape.chartCommentaryJson.safeParse(
        null,
      ).success,
    ).toBe(true);
  });
  it("uses exchange close for short final bars, DST, early closes and holiday weeks", () => {
    expect(
      new Date(barClosedAt("2026-09-04T17:30:00Z", "4h")).toISOString(),
    ).toBe("2026-09-04T20:00:00.000Z");
    expect(
      new Date(barClosedAt("2026-01-05T18:30:00Z", "4h")).toISOString(),
    ).toBe("2026-01-05T21:00:00.000Z");
    expect(
      new Date(barClosedAt("2025-07-03T13:30:00Z", "4h")).toISOString(),
    ).toBe("2025-07-03T17:00:00.000Z");
    expect(
      new Date(barClosedAt("2026-03-30T13:30:00Z", "1w")).toISOString(),
    ).toBe("2026-04-02T20:00:00.000Z");
    expect(
      new Date(barClosedAt("2026-07-02T13:30:00Z", "1d")).toISOString(),
    ).toBe("2026-07-02T20:00:00.000Z");
  });
  it("excludes ongoing candles and preserves the original split-adjusted price precision", () => {
    const bar = {
      timestamp: "2026-09-04T19:30:00Z",
      open: 229.1234,
      high: 231,
      low: 228,
      close: 230.345,
      volume: 9,
    };
    expect(closedChartBars([bar], "1h", "2026-09-04T19:59:59Z")).toEqual([]);
    expect(closedChartBars([bar], "1h", "2026-09-04T20:00:00Z")[0]?.close).toBe(
      230.345,
    );
  });
  it("exposes pivots only after two right-hand candles close", () => {
    const values = [10, 11, 15, 12, 11];
    const bars: ChartBar[] = values.map((high, i) => ({
      timestamp: new Date(Date.UTC(2026, 8, 1, 14 + i)).toISOString(),
      closedAt: new Date(Date.UTC(2026, 8, 1, 15 + i)).toISOString(),
      open: high - 1,
      high,
      low: high - 2,
      close: high - 0.5,
      volume: 1,
    }));
    expect(confirmedPivots(bars.slice(0, 4))).toEqual([]);
    expect(confirmedPivots(bars)).toContainEqual({
      index: 2,
      price: 15,
      side: "supply",
      confirmedIndex: 4,
    });
  });
  it("reconstructs only complete trading weeks and omits unwarmed weekly SMA 200", () => {
    const set = dailySet();
    const daily = closedChartBars(set.bars, "1d", "2026-01-01T00:00:00Z");
    const partialWeek = daily.filter(
      (bar) =>
        bar.timestamp.startsWith("2025-01-02") ||
        bar.timestamp.startsWith("2025-01-03"),
    );
    expect(weeklyFromDaily(partialWeek, "2026-01-01T00:00:00Z")).toEqual([]);
    const snapshot = buildTechnicalChart({
      symbol: "TEST",
      asOf: "2026-01-01T00:00:00Z",
      sets: [set],
    });
    const weekly = snapshot.frames.find((frame) => frame.timeframe === "1w");
    expect(weekly?.origin).toBe("derived_from_daily");
    expect(weekly?.averages.some((average) => average.period === 200)).toBe(
      false,
    );
    expect(
      snapshot.frames.find((frame) => frame.timeframe === "1h")?.status,
    ).toBe("unavailable");
    expect(snapshot.status).toBe("partial");
  });
  it("replays identically after future candles are removed and keeps drawings on their anchors", () => {
    const set = dailySet();
    const asOf = "2025-07-01T20:00:00Z";
    const full = buildTechnicalChart({ symbol: "TEST", asOf, sets: [set] });
    const truncated = buildTechnicalChart({
      symbol: "TEST",
      asOf,
      sets: [
        {
          ...set,
          bars: set.bars.filter(
            (bar) => Date.parse(bar.timestamp) <= Date.parse(asOf),
          ),
        },
      ],
    });
    expect(full.dataHash).toBe(truncated.dataHash);
    const frame = full.frames.find((item) => item.timeframe === "1d");
    expect(frame?.drawings).toEqual(
      truncated.frames.find((item) => item.timeframe === "1d")?.drawings,
    );
    expect(frame?.drawings.length).toBeGreaterThan(0);
    for (const drawing of frame?.drawings ?? []) {
      expect(Date.parse(drawing.confirmedAt)).toBeLessThanOrEqual(
        Date.parse(asOf),
      );
      if (drawing.kind === "trend" || drawing.kind === "channel")
        for (const anchor of drawing.anchors.slice(0, 2))
          expect(linePrice(drawing, anchor.index)).toBeCloseTo(anchor.price, 8);
    }
    if (frame)
      expect(technicalChartSvg(frame)).not.toMatch(/NaN|Infinity|undefined/);
  });
  it("isolates invalid optional commentary and rejects invented prices and references", () => {
    const snapshot = buildTechnicalChart({
      symbol: "TEST",
      asOf: "2026-01-01T00:00:00Z",
      sets: [dailySet()],
    });
    expect(applyJuneChartCommentary(snapshot, "not json")).toBe(snapshot);
    const invalid = {
      synthesis: {
        en: "Guaranteed next target $999",
        ko: "다음 목표 가격은 999입니다.",
      },
      frames: [
        {
          timeframe: "1d",
          focusDrawingIds: ["invented"],
          observation: {
            en: "There is a strong but unverified structure here.",
            ko: "확인되지 않은 구조를 근거로 한 문장입니다.",
          },
        },
      ],
    };
    expect(applyJuneChartCommentary(snapshot, JSON.stringify(invalid))).toEqual(
      snapshot,
    );
    const valid = {
      synthesis: {
        en: "The weekly advance has support, while the daily range still needs a closing breakout before an hourly rebound changes the entry case.",
        ko: "주봉 상승의 지지는 남아 있지만 일봉 범위의 종가 돌파를 확인해야 한 시간 반등을 진입 판단으로 확대할 수 있습니다.",
      },
      frames: [],
    };
    expect(
      applyJuneChartCommentary(snapshot, JSON.stringify(valid))
        .commentarySource,
    ).toBe("june");
    const localized = applyJuneChartCommentary(
      snapshot,
      JSON.stringify({
        ...valid,
        synthesis: { ko: valid.synthesis.ko },
      }),
    );
    expect(localized.commentarySource).toBe("june");
    expect(localized.synthesis.ko).toBe(valid.synthesis.ko);
    expect(localized.synthesis.en).toBe(snapshot.synthesis.en);
  });
});
