"use client";
import dynamic from "next/dynamic";
import { Component, type ReactNode, useEffect, useState } from "react";
import type { ResearchFileData } from "../../../research/compositions/types";
import {
  type TechnicalChartFrame,
  type TechnicalChartSnapshot,
  TechnicalChartSnapshotSchema,
} from "../../../research/domain/technicalChart";
import {
  chartPrice,
  DRAWING_NAMES,
  drawingCurrentRange,
  FRAME_NAMES,
  REGIME_NAMES,
  scenarioText,
} from "../../../research/technical/chartPresentation";
import styles from "./technical/technicalChart.module.css";

const Chart = dynamic(() => import("./technical/TechnicalTimeframeChart"), {
  ssr: false,
  loading: () => <div className={styles.canvas} aria-busy="true" />,
});
class ChartBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
function FrameCard({
  frame,
  locale,
}: {
  frame: TechnicalChartFrame;
  locale: "en" | "ko";
}) {
  const [selectedId, setSelectedId] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  const ko = locale === "ko";
  const selected = frame.drawings.find((item) => item.id === selectedId);
  const primary = frame.regime === "falling" ? "down" : "up";
  const last = frame.bars.at(-1);
  return (
    <article
      className={`${styles.card} ${expanded ? styles.expanded : ""}`}
      data-timeframe={frame.timeframe}
      data-regime={frame.regime}
    >
      <header className={styles.cardHeader}>
        <div>
          <h3>{FRAME_NAMES[frame.timeframe][locale]}</h3>
          <span>{REGIME_NAMES[frame.regime][locale]}</span>
        </div>
        <div className={styles.cardMeta}>
          {last && (
            <strong>
              {chartPrice(last.close)} <small>USD</small>
            </strong>
          )}
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? (ko ? "축소" : "Collapse") : ko ? "확대" : "Expand"}
          </button>
        </div>
      </header>
      {frame.status === "unavailable" ? (
        <p className={styles.unavailable}>
          {ko
            ? "확정봉 이력이 부족해 이 시간대의 작도를 생략했습니다."
            : "There is not enough closed-candle history for this timeframe."}
        </p>
      ) : (
        <ChartBoundary
          fallback={
            <p className={styles.unavailable}>
              {ko
                ? "차트를 표시하지 못했습니다. 저장된 가격 구간과 조건은 아래에 있습니다."
                : "Chart unavailable. Saved levels and conditions remain below."}
            </p>
          }
        >
          <Chart frame={frame} locale={locale} selectedId={selectedId} />
        </ChartBoundary>
      )}
      <div className={styles.cardCopy}>
        <p className={styles.observation}>{frame.observation[locale]}</p>
        {frame.drawings.length > 0 && (
          <fieldset
            className={styles.levels}
            aria-label={ko ? "작도와 근거 선택" : "Select drawing and evidence"}
          >
            {frame.drawings.map((drawing) => {
              const range = drawingCurrentRange(drawing, frame);
              return (
                <button
                  type="button"
                  key={drawing.id}
                  data-side={drawing.side}
                  aria-pressed={selectedId === drawing.id}
                  onClick={() =>
                    setSelectedId((id) =>
                      id === drawing.id ? undefined : drawing.id,
                    )
                  }
                >
                  <span>{DRAWING_NAMES[drawing.kind][locale]}</span>
                  <strong>
                    {chartPrice(range.low)}
                    {range.high - range.low > 0.005
                      ? `–${chartPrice(range.high)}`
                      : ""}
                  </strong>
                </button>
              );
            })}
          </fieldset>
        )}
        {selected && (
          <div className={styles.drawingReason} aria-live="polite">
            <p>{selected.reason[locale]}</p>
            <small>
              {ko ? "앵커 확인" : "Anchor confirmed"}{" "}
              {new Date(selected.confirmedAt).toLocaleDateString(
                locale === "ko" ? "ko-KR" : "en-US",
                { timeZone: "America/New_York" },
              )}{" "}
              ·{" "}
              {selected.strength === "tentative"
                ? ko
                  ? "잠정"
                  : "Tentative"
                : ko
                  ? "반복 확인"
                  : "Repeated reactions"}
            </small>
          </div>
        )}
        {frame.scenarios.length > 0 && (
          <dl className={styles.scenarios}>
            <div data-direction={primary}>
              <dt>
                {frame.regime === "range"
                  ? ko
                    ? "상단 확인"
                    : "Upper boundary"
                  : ko
                    ? "기본 경로"
                    : "Primary path"}
              </dt>
              <dd>{scenarioText(frame, primary, locale)}</dd>
            </div>
            <div data-direction={primary === "up" ? "down" : "up"}>
              <dt>
                {frame.regime === "range"
                  ? ko
                    ? "하단 확인"
                    : "Lower boundary"
                  : ko
                    ? "대안 경로"
                    : "Alternative"}
              </dt>
              <dd>
                {scenarioText(frame, primary === "up" ? "down" : "up", locale)}
              </dd>
            </div>
          </dl>
        )}
        <p className={styles.coverage}>
          {last
            ? `${ko ? "마지막 확정" : "Last closed"} ${new Date(last.closedAt).toLocaleString(ko ? "ko-KR" : "en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })} ET · ${frame.bars.length}${ko ? "봉" : " bars"}`
            : ""}
          {frame.limitation ? ` · ${frame.limitation[locale]}` : ""}
        </p>
      </div>
    </article>
  );
}
export function TechnicalChartResearchPage({
  file,
  locale,
  snapshot,
}: {
  file: Pick<ResearchFileData, "technicalChart" | "reportId">;
  locale: "en" | "ko";
  snapshot?: TechnicalChartSnapshot;
}) {
  const [chart, setChart] = useState<TechnicalChartSnapshot | undefined>(
    snapshot,
  );
  const [loading, setLoading] = useState(snapshot === undefined);
  const [retry, setRetry] = useState(0);
  const manifest = file.technicalChart;
  const analysisAsOf = manifest?.analysisAsOf;
  const digest = manifest?.digest;
  const reportId = file.reportId;
  const ko = locale === "ko";
  useEffect(() => {
    if (snapshot || !analysisAsOf || !digest || !reportId) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(
      `/api/research/reports/${encodeURIComponent(reportId)}/technical-chart`,
      {
        signal: controller.signal,
        credentials: "same-origin",
        cache: retry > 0 ? "reload" : "default",
      },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("chart unavailable");
        return response.json() as Promise<{ chart: unknown; digest?: string }>;
      })
      .then((body) => {
        if (controller.signal.aborted) return;
        const parsed = TechnicalChartSnapshotSchema.safeParse(body.chart);
        setChart(
          parsed.success &&
            parsed.data.analysisAsOf === analysisAsOf &&
            body.digest === digest
            ? parsed.data
            : undefined,
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setChart(undefined);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reportId, analysisAsOf, digest, snapshot, retry]);
  if (!manifest && !snapshot) return null;
  return (
    <section
      id="technical-chart"
      className={`research-editorial-section ${styles.page}`}
      data-report-section="technical-chart"
      aria-labelledby="technical-chart-title"
    >
      <header className={styles.chapter}>
        <span>02</span>
        <div>
          <p className={styles.eyebrow}>
            JUNE / {ko ? "차트 리서치" : "CHART RESEARCH"}
          </p>
          <h2 id="technical-chart-title">
            {ko ? "차트 구조와 다음 움직임" : "Chart structure & the next move"}
          </h2>
          <p>
            {ko
              ? "주봉의 방향, 일봉의 구조, 네 시간의 셋업, 한 시간의 확인을 연결합니다."
              : "Weekly context. Daily structure. Four-hour setup. Hourly confirmation."}
          </p>
        </div>
      </header>
      {chart ? (
        <>
          <div className={styles.thesis}>
            <span>
              {ko ? "시간대를 연결한 해석" : "The multi-timeframe read"}
            </span>
            <p>{chart.synthesis[locale]}</p>
          </div>
          <div className={styles.grid}>
            {chart.frames.map((frame) => (
              <FrameCard key={frame.timeframe} frame={frame} locale={locale} />
            ))}
          </div>
          <footer className={styles.footer}>
            <p>
              {ko
                ? "점선은 다음 확정봉에서 확인할 조건부 경로입니다. 미래 캔들이나 상승 확률을 뜻하지 않습니다. 지지 S · 저항 R · 오더블록은 가격 반응 후보입니다."
                : "Dotted paths mark conditions to check on the next closed candle, not future candles or odds. S = support; R = resistance. Order blocks are price-reaction candidates."}
            </p>
            <p>
              InsightSentry ·{" "}
              {ko
                ? "정규장 · 분할 조정 · 배당 미조정"
                : "Regular session · Split adjusted · Dividends unadjusted"}{" "}
              ·{" "}
              {new Date(chart.analysisAsOf).toLocaleDateString(
                ko ? "ko-KR" : "en-US",
              )}{" "}
              ·{" "}
              <a
                href="https://www.tradingview.com/"
                target="_blank"
                rel="noreferrer"
              >
                TradingView Lightweight Charts™
              </a>
            </p>
          </footer>
        </>
      ) : (
        <div className={styles.unavailable} aria-live="polite">
          <p>
            {loading
              ? ko
                ? "저장된 차트 분석을 불러오는 중입니다…"
                : "Loading saved chart analysis…"
              : ko
                ? "차트 분석을 불러오지 못했습니다. 리서치 본문은 정상적으로 읽을 수 있습니다."
                : "Chart analysis is unavailable. The research report remains available."}
          </p>
          {!loading && (
            <button
              type="button"
              onClick={() => setRetry((value) => value + 1)}
            >
              {ko ? "다시 불러오기" : "Try again"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
