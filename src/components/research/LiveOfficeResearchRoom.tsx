"use client";

import { useEffect, useMemo, useState } from "react";
import type { Locale } from "../../lib/i18n";
import { findTicker, searchUsTickers, type Ticker } from "../../lib/tickers";
import { createResearchClient } from "../../research/client/api";
import type { PublicRunDetail } from "../../research/client/schemas";
import { useResearchRun } from "../../research/client/useResearchRun";
import type { ResearchFileData } from "../../research/compositions/types";
import {
  type ResearchReport,
  ResearchReportSchema,
} from "../../research/domain/report";
import { useLiveOfficeAnimation } from "../../research/liveOfficeAnimation";
import { liveOfficeProjection } from "../../research/liveOfficeProjection";
import { agents } from "../../research/mockResearch";
import { activeIdsForSnapshot } from "../../research/officePlaybackView";
import { researchReportToFile } from "../../research/researchReportToFile";
import type { ResearchCompany } from "../../research/types";
import { MeetingMinutes } from "./MeetingMinutes";
import { OfficeStage } from "./OfficeStage";
import { ResearchSidebar } from "./ResearchSidebar";

type Props = {
  readonly initialLocale: Locale;
  readonly initialSnapshot: PublicRunDetail;
};

const pendingReport: ResearchFileData = {
  teamViews: [],
  evidenceIndex: [],
  coverage: [],
  posture: "neutral",
  postureLabel: { en: "Pending", ko: "진행 중" },
  limitationNote: { en: "Research in progress", ko: "리서치 진행 중" },
  evidenceScore: { passed: 0, denominator: 0 },
  sourceCount: 0,
  claimCount: 0,
  asOf: { en: "Pending", ko: "진행 중" },
  freshness: { en: "Pending", ko: "진행 중" },
  condition: { en: "Research in progress", ko: "리서치 진행 중" },
  expectation: { en: "Research in progress", ko: "리서치 진행 중" },
  valuation: { en: "Research in progress", ko: "리서치 진행 중" },
  nextEvent: { en: "Research in progress", ko: "리서치 진행 중" },
  thesis: { en: "Research in progress", ko: "리서치 진행 중" },
  changeCondition: { en: "Research in progress", ko: "리서치 진행 중" },
  positives: [],
  concerns: [],
  analysis: [],
  scenarios: [],
  appendix: [],
  versions: [],
};

function companyFor(symbol: string, catalogTicker?: Ticker): ResearchCompany {
  const ticker = findTicker(symbol) ?? catalogTicker;
  return {
    symbol,
    company: ticker?.company ?? symbol,
    exchange: ticker?.exchange ?? "NASDAQ",
    sector: ticker?.sector ?? "Equity research",
    price: "—",
    change: "—",
    marketStatus: {
      en: "Durable public-data research",
      ko: "공개 데이터 기반 리서치",
    },
  };
}

async function loadReport(
  reportId: string,
  reloadSequence: number,
): Promise<ResearchReport> {
  let lastError: Error = new Error("Published report is unavailable");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0)
      await new Promise((resolve) => window.setTimeout(resolve, attempt * 600));
    try {
      const response = await fetch(
        `/api/research/reports/${reportId}?reload=${reloadSequence}`,
        {
          credentials: "same-origin",
          cache: "no-store",
        },
      );
      if (!response.ok) throw new Error("Published report is unavailable");
      const body: unknown = await response.json();
      const value =
        typeof body === "object" && body !== null
          ? Reflect.get(body, "report")
          : undefined;
      return ResearchReportSchema.parse(value);
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error("Published report is unavailable");
    }
  }
  throw lastError;
}

export function LiveOfficeResearchRoom({
  initialLocale,
  initialSnapshot,
}: Props) {
  const [locale, setLocale] = useState(initialLocale);
  const [report, setReport] = useState<ResearchReport>();
  const [reportLoadState, setReportLoadState] = useState<
    "idle" | "loading" | "failed"
  >("idle");
  const [reportReload, setReportReload] = useState(0);
  const [catalogTicker, setCatalogTicker] = useState<Ticker>();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const client = useMemo(() => createResearchClient(), []);
  const runOptions = useMemo(() => ({ client }), [client]);
  const projection = useResearchRun(initialSnapshot, runOptions);
  const office = liveOfficeProjection(projection.snapshot);
  const animation = useLiveOfficeAnimation(office.tick);
  const snapshot = animation.snapshot;
  const activity = activeIdsForSnapshot(snapshot);
  const company = companyFor(projection.snapshot.run.symbol, catalogTicker);
  const completed = projection.state === "published" && report !== undefined;
  const terminal =
    projection.state === "failed" ||
    projection.state === "incomplete" ||
    projection.state === "cancelled";
  const reportFile =
    report === undefined
      ? pendingReport
      : researchReportToFile(report, projection.snapshot.run.createdAt);

  useEffect(() => {
    document.documentElement.lang = locale;
    const url = new URL(window.location.href);
    url.searchParams.set("lang", locale);
    window.history.replaceState(null, "", url);
  }, [locale]);

  useEffect(() => {
    const symbol = projection.snapshot.run.symbol;
    if (findTicker(symbol) !== undefined) return;
    const controller = new AbortController();
    void searchUsTickers(symbol, controller.signal)
      .then((results) => {
        const exact = results.find((ticker) => ticker.symbol === symbol);
        if (exact !== undefined) setCatalogTicker(exact);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setCatalogTicker(undefined);
      });
    return () => controller.abort();
  }, [projection.snapshot.run.symbol]);

  useEffect(() => {
    const reportId = projection.snapshot.run.reportId;
    if (reportId === undefined) return;
    let active = true;
    setReportLoadState("loading");
    void loadReport(reportId, reportReload)
      .then((value) => {
        if (active) {
          setReport(value);
          setReportLoadState("idle");
        }
      })
      .catch(() => {
        if (active) {
          setReport(undefined);
          setReportLoadState("failed");
        }
      });
    return () => {
      active = false;
    };
  }, [projection.snapshot.run.reportId, reportReload]);

  useEffect(() => {
    if (completed) setTranscriptOpen(true);
  }, [completed]);

  const connectionIssue =
    projection.state === "connection-interrupted" ||
    projection.state === "degraded" ||
    projection.state === "reauthenticating";
  const showReportNotice =
    projection.state === "published" && reportLoadState !== "idle";

  return (
    <div
      className="research-shell"
      lang={locale}
      data-research-mode="official"
      data-research-state={projection.state}
      data-sidebar-open={sidebarOpen ? "true" : "false"}
      data-transcript-open={completed && transcriptOpen ? "true" : "false"}
    >
      <div className="research-layout">
        {connectionIssue || showReportNotice ? (
          <div className="research-run-notice" role="status" aria-live="polite">
            <div>
              <strong>
                {showReportNotice
                  ? reportLoadState === "failed"
                    ? locale === "ko"
                      ? "분석은 완료됐지만 보고서를 불러오지 못했습니다."
                      : "Analysis finished, but the report could not be loaded."
                    : locale === "ko"
                      ? "완료된 보고서를 불러오는 중입니다."
                      : "Loading the completed report."
                  : locale === "ko"
                    ? "연결을 복구하며 분석 상태를 확인하고 있습니다."
                    : "Restoring the connection and checking analysis status."}
              </strong>
              <span>
                {locale === "ko"
                  ? "작업 기록은 서버에 보존됩니다."
                  : "Your durable research record remains saved."}
              </span>
            </div>
            {reportLoadState === "failed" ? (
              <button
                type="button"
                onClick={() => setReportReload((value) => value + 1)}
              >
                {locale === "ko" ? "보고서 다시 불러오기" : "Reload report"}
              </button>
            ) : connectionIssue ? (
              <button type="button" onClick={() => void projection.resync()}>
                {locale === "ko" ? "지금 다시 연결" : "Reconnect now"}
              </button>
            ) : null}
          </div>
        ) : null}
        <ResearchSidebar
          agents={agents}
          company={company}
          defaultAgentIds={agents.map((agent) => agent.id)}
          history={[
            {
              symbol: company.symbol,
              company: company.company,
              runs: [
                {
                  label:
                    locale === "ko"
                      ? "전체 에이전트 분석"
                      : "Full agent analysis",
                  date: projection.snapshot.run.createdAt.slice(0, 10),
                  live: !completed && !terminal,
                },
              ],
            },
          ]}
          locale={locale}
          collapsed={!sidebarOpen}
          onCollapsedChange={(collapsed) => setSidebarOpen(!collapsed)}
          onLocaleChange={setLocale}
        />
        <OfficeStage
          current={office.current}
          snapshot={snapshot}
          renderPreviousSnapshot={animation.previousSnapshot}
          renderInterpolationAlpha={animation.interpolation}
          locale={locale}
          isPaused={false}
          isComplete={completed}
          company={company}
          report={reportFile}
          reportVersion={report?.version ?? 1}
          {...(projection.snapshot.run.reportId === undefined
            ? {}
            : { reportId: projection.snapshot.run.reportId })}
          activeAgentIds={activity.active}
          onReplay={() => window.location.reload()}
        />
        <MeetingMinutes
          current={office.current}
          agents={agents}
          events={office.events}
          locale={locale}
          isComplete={completed}
          {...(terminal ? { terminalState: projection.state } : {})}
          {...(projection.snapshot.run.reportId === undefined
            ? {}
            : { reportId: projection.snapshot.run.reportId })}
          reportVersion={report?.version ?? 1}
          panelOpen={completed ? transcriptOpen : true}
          onPanelToggle={() => setTranscriptOpen((open) => !open)}
        />
      </div>
      <span className="sr-only" data-testid="public-ledger">
        {office.events.length} durable public events · tick {office.tick}
      </span>
    </div>
  );
}
