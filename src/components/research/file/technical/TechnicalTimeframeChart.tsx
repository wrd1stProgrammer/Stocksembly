"use client";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import type { TechnicalChartFrame } from "../../../../research/domain/technicalChart";
import { VISIBLE_BARS } from "../../../../research/technical/chartPresentation";
import {
  type ChartPalette,
  TechnicalChartPrimitive,
} from "./TechnicalChartPrimitive";
import styles from "./technicalChart.module.css";

function palette(element: HTMLElement): ChartPalette {
  const css = getComputedStyle(element);
  const token = (name: string, fallback: string) =>
    css.getPropertyValue(name).trim() || fallback;
  return {
    paper: token("--editorial-paper", "#fff"),
    ink: token("--editorial-ink", "#20221f"),
    muted: token("--editorial-muted", "#73766f"),
    rule: token("--editorial-rule", "#e5e5df"),
    up: token("--editorial-chart-positive", "#237759"),
    down: token("--editorial-chart-negative", "#bc5060"),
    average: token("--editorial-chart-neutral", "#3f6aaa"),
    slow: token("--editorial-chart-warning", "#a58132"),
  };
}
export default function TechnicalTimeframeChart({
  frame,
  locale,
  selectedId,
}: {
  frame: TechnicalChartFrame;
  locale: "en" | "ko";
  selectedId: string | undefined;
}) {
  const container = useRef<HTMLDivElement>(null);
  const controls = useRef<{
    reset: () => void;
    update: (
      selected: string | undefined,
      drawings: boolean,
      slow: boolean,
    ) => void;
  } | null>(null);
  const [drawings, setDrawings] = useState(true);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let cleanup = () => {};
    try {
      let colors = palette(element);
      const chart = createChart(element, {
        autoSize: true,
        height: 290,
        layout: {
          background: { type: ColorType.Solid, color: colors.paper },
          textColor: colors.muted,
          fontSize: 10,
          attributionLogo: true,
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { color: colors.rule, style: LineStyle.Dotted },
        },
        rightPriceScale: {
          borderVisible: false,
          scaleMargins: { top: 0.09, bottom: 0.19 },
        },
        timeScale: {
          borderVisible: false,
          timeVisible: frame.timeframe === "1h" || frame.timeframe === "4h",
          secondsVisible: false,
          rightOffset: 8,
        },
        localization: {
          locale: locale === "ko" ? "ko-KR" : "en-US",
          timeFormatter: (time: number) =>
            new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
              timeZone: "America/New_York",
              month: "short",
              day: "numeric",
              ...(frame.timeframe.endsWith("h")
                ? ({ hour: "2-digit", minute: "2-digit" } as const)
                : {}),
            }).format(new Date(time * 1000)),
        },
        handleScroll: {
          mouseWheel: false,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: false,
        },
      });
      cleanup = () => chart.remove();
      const time = (timestamp: string) =>
        (Date.parse(timestamp) / 1000) as UTCTimestamp;
      const candles = chart.addSeries(CandlestickSeries, {
        upColor: colors.up,
        downColor: colors.down,
        borderVisible: false,
        wickUpColor: colors.up,
        wickDownColor: colors.down,
        priceLineVisible: false,
        lastValueVisible: true,
      });
      candles.setData(
        frame.bars.map((bar) => ({
          time: time(bar.timestamp),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        })),
      );
      const volume = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
        lastValueVisible: false,
        priceLineVisible: false,
      });
      volume.priceScale().applyOptions({
        scaleMargins: { top: 0.87, bottom: 0 },
        visible: false,
      });
      const volumeData = () =>
        frame.bars.map((bar) => ({
          time: time(bar.timestamp),
          value: bar.volume,
          color: bar.close >= bar.open ? `${colors.up}45` : `${colors.down}45`,
        }));
      volume.setData(volumeData());
      const averages = frame.averages.map((average) => {
        const series = chart.addSeries(LineSeries, {
          color:
            average.period === 20
              ? colors.average
              : average.period === 50
                ? colors.slow
                : colors.muted,
          lineWidth: 1,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          visible: average.period !== 200,
        });
        series.setData(
          average.points.flatMap((point) => {
            const bar = frame.bars[point.index];
            return bar
              ? [{ time: time(bar.timestamp), value: point.price }]
              : [];
          }),
        );
        return { period: average.period, series };
      });
      const primitive = new TechnicalChartPrimitive(frame, colors);
      candles.attachPrimitive(primitive);
      let selected: string | undefined;
      let showDrawings = true;
      const reset = () =>
        chart.timeScale().setVisibleLogicalRange({
          from: Math.max(0, frame.bars.length - VISIBLE_BARS[frame.timeframe]),
          to: frame.bars.length + 8,
        });
      controls.current = {
        reset,
        update: (nextSelected, nextDrawings, nextSlow) => {
          selected = nextSelected;
          showDrawings = nextDrawings;
          primitive.update(colors, selected, showDrawings);
          averages
            .find((average) => average.period === 200)
            ?.series.applyOptions({ visible: nextSlow });
        },
      };
      reset();
      const observer = new MutationObserver(() => {
        colors = palette(element);
        chart.applyOptions({
          layout: {
            background: { type: ColorType.Solid, color: colors.paper },
            textColor: colors.muted,
          },
          grid: { horzLines: { color: colors.rule } },
        });
        candles.applyOptions({
          upColor: colors.up,
          downColor: colors.down,
          wickUpColor: colors.up,
          wickDownColor: colors.down,
        });
        volume.setData(volumeData());
        for (const average of averages)
          average.series.applyOptions({
            color:
              average.period === 20
                ? colors.average
                : average.period === 50
                  ? colors.slow
                  : colors.muted,
          });
        primitive.update(colors, selected, showDrawings);
      });
      const document = element.closest("[data-report-theme]");
      if (document)
        observer.observe(document, {
          attributes: true,
          attributeFilter: ["data-report-theme"],
        });
      cleanup = () => {
        observer.disconnect();
        controls.current = null;
        chart.remove();
      };
    } catch {
      cleanup();
      setError(true);
    }
    return cleanup;
  }, [frame, locale]);
  useEffect(() => {
    controls.current?.update(selectedId, drawings, slow);
  }, [selectedId, drawings, slow]);
  return (
    <>
      <fieldset
        className={styles.toolbar}
        aria-label={locale === "ko" ? "차트 표시" : "Chart display"}
      >
        <button
          type="button"
          aria-pressed={drawings}
          onClick={() => setDrawings((value) => !value)}
        >
          {locale === "ko" ? "작도" : "Drawings"}
        </button>
        <span className={styles.average20}>SMA 20</span>
        <span className={styles.average50}>SMA 50</span>
        {frame.averages.some((item) => item.period === 200) && (
          <button
            type="button"
            aria-pressed={slow}
            onClick={() => setSlow((value) => !value)}
          >
            SMA 200
          </button>
        )}
        <button type="button" onClick={() => controls.current?.reset()}>
          {locale === "ko" ? "초기 범위" : "Reset view"}
        </button>
      </fieldset>
      {error ? (
        <p className={styles.unavailable}>
          {locale === "ko"
            ? "차트를 표시하지 못했습니다. 아래 가격 구간과 조건은 저장된 분석입니다."
            : "Chart unavailable. The saved levels and conditions remain below."}
        </p>
      ) : (
        <div
          ref={container}
          className={styles.canvas}
          role="img"
          aria-label={`${frame.timeframe} ${locale === "ko" ? "확정봉과 작도. 아래 설명에서 가격과 확인 조건을 읽을 수 있습니다." : "closed candles and drawings. Levels and conditions are available in the text below."}`}
        />
      )}
    </>
  );
}
