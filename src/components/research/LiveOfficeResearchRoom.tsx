"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createAuthenticatedResearchClient } from "../../auth/researchClient";
import type { Locale } from "../../lib/i18n";
import {
  fetchResearchQuote,
  findTicker,
  type ResearchQuote,
  searchUsTickers,
  type Ticker,
} from "../../lib/tickers";
import type { PublicRun, PublicRunDetail } from "../../research/client/schemas";
import { useResearchRun } from "../../research/client/useResearchRun";
import type {
  ResearchFileData,
  ResearchHistoryGroup,
} from "../../research/compositions/types";
import type {
  ResearchReport,
  WorkflowV2ResearchReport,
} from "../../research/domain/report";
import { parseStoredResearchReportVersioned } from "../../research/domain/reportStorage";
import {
  type ResearchComparison,
  ResearchComparisonSchema,
} from "../../research/domain/researchComparison";
import { RESEARCH_DEPARTMENT_COPY } from "../../research/domain/researchTarget";
import { useLiveOfficeAnimation } from "../../research/liveOfficeAnimation";
import { liveOfficeProjection } from "../../research/liveOfficeProjection";
import { agents } from "../../research/mockResearch";
import { activeIdsForSnapshot } from "../../research/officePlaybackView";
import { OFFICE_SCENE_MANIFEST } from "../../research/officeSceneManifest";
import type { OfficeSimulationSnapshot } from "../../research/officeSimulation";
import { formatSignedPercent } from "../../research/publicPresentation";
import { researchReportToFile } from "../../research/researchReportToFile";
import type { ResearchCompany } from "../../research/types";
import { MeetingMinutes } from "./MeetingMinutes";
import { OfficeStage } from "./OfficeStage";
import { ResearchSidebar } from "./ResearchSidebar";

type Props = {
  readonly initialLocale: Locale;
  readonly initialSnapshot: PublicRunDetail;
};

const sidebarPriceFormatters = new Map<string, Intl.NumberFormat>();

function sidebarPriceFormatter(currency: string): Intl.NumberFormat {
  const cached = sidebarPriceFormatters.get(currency);
  if (cached !== undefined) return cached;
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  sidebarPriceFormatters.set(currency, formatter);
  return formatter;
}

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

function companyFor(
  symbol: string,
  catalogTicker?: Ticker,
  marketSnapshot?: ResearchReport["marketSnapshot"] | ResearchQuote,
): ResearchCompany {
  const ticker = findTicker(symbol) ?? catalogTicker;
  const price =
    marketSnapshot === undefined
      ? "—"
      : sidebarPriceFormatter(marketSnapshot.currency).format(
          marketSnapshot.lastPrice,
        );
  const change =
    marketSnapshot?.changePercent === undefined
      ? "—"
      : formatSignedPercent(marketSnapshot.changePercent);
  return {
    symbol,
    company: ticker?.company ?? symbol,
    exchange: ticker?.exchange ?? "NASDAQ",
    sector: ticker?.sector ?? "Equity research",
    price,
    change,
    marketStatus: {
      en: "Durable public-data research",
      ko: "공개 데이터 기반 리서치",
    },
  };
}

export function formatResearchHistoryDate(
  createdAt: string,
  locale: Locale,
): string {
  const date = new Date(createdAt);
  const year = String(date.getUTCFullYear()).slice(-2);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return locale === "ko"
    ? `${year}.${month}.${day}`
    : `${month}.${day}.${year}`;
}

function scopeOfficeSnapshot(
  snapshot: OfficeSimulationSnapshot,
  run: PublicRun,
): OfficeSimulationSnapshot {
  const target = run.researchTarget;
  if (target === undefined || target.kind === "committee") return snapshot;
  const selected = new Set<string>(
    OFFICE_SCENE_MANIFEST.departments[target.departmentId]?.memberIds ?? [],
  );
  const actorIds = snapshot.actors
    .filter((actor) => selected.has(actor.id))
    .map((actor) => actor.id);
  return Object.freeze({
    ...snapshot,
    actors: Object.freeze(
      snapshot.actors.filter((actor) => selected.has(actor.id)),
    ),
    occupancy: Object.freeze(
      snapshot.occupancy.filter((entry) => selected.has(entry.actorId)),
    ),
    reservations: Object.freeze(
      snapshot.reservations.filter((entry) => selected.has(entry.actorId)),
    ),
    cameraTarget:
      actorIds.length === 0
        ? { kind: "overview" as const }
        : { kind: "actors" as const, actorIds },
  });
}

function runLabel(run: PublicRun, ordinal: number, locale: Locale): string {
  const target = run.researchTarget;
  if (target === undefined || target.kind === "committee")
    return locale === "ko"
      ? `전체 에이전트 분석 ${ordinal}`
      : `Full agent analysis ${ordinal}`;
  const team =
    RESEARCH_DEPARTMENT_COPY[target.departmentId][
      locale === "ko" ? "ko" : "en"
    ];
  return locale === "ko"
    ? `${team} 심층 분석 ${ordinal}`
    : `${team} deep dive ${ordinal}`;
}

export async function loadReport(
  reportId: string,
  reloadSequence: number,
): Promise<{
  readonly report: ResearchReport | WorkflowV2ResearchReport;
  readonly comparison?: ResearchComparison;
}> {
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
      const report = parseStoredResearchReportVersioned(value);
      const comparisonValue =
        typeof body === "object" && body !== null
          ? Reflect.get(body, "comparison")
          : undefined;
      const comparison = ResearchComparisonSchema.safeParse(comparisonValue);
      return {
        report,
        ...(comparison.success ? { comparison: comparison.data } : {}),
      };
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
  const [report, setReport] = useState<
    ResearchReport | WorkflowV2ResearchReport
  >();
  const [comparison, setComparison] = useState<ResearchComparison>();
  const [reportLoadState, setReportLoadState] = useState<
    "idle" | "loading" | "failed"
  >("idle");
  const [reportReload, setReportReload] = useState(0);
  const [catalogTicker, setCatalogTicker] = useState<Ticker>();
  const [liveQuote, setLiveQuote] = useState<ResearchQuote>();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [historyRuns, setHistoryRuns] = useState<readonly PublicRun[]>([
    initialSnapshot.run,
  ]);
  const router = useRouter();
  const client = useMemo(() => createAuthenticatedResearchClient(), []);
  const runOptions = useMemo(() => ({ client }), [client]);
  const projection = useResearchRun(initialSnapshot, runOptions);
  const office = liveOfficeProjection(projection.snapshot);
  const animation = useLiveOfficeAnimation(office.tick);
  const snapshot = scopeOfficeSnapshot(
    animation.snapshot,
    projection.snapshot.run,
  );
  const previousSnapshot = scopeOfficeSnapshot(
    animation.previousSnapshot,
    projection.snapshot.run,
  );
  const activity = activeIdsForSnapshot(snapshot);
  const visibleAgents = useMemo(() => {
    const target = projection.snapshot.run.researchTarget;
    if (target === undefined || target.kind === "committee") return agents;
    const selected = new Set<string>(
      OFFICE_SCENE_MANIFEST.departments[target.departmentId]?.memberIds ?? [],
    );
    return agents.filter((agent) => selected.has(agent.id));
  }, [projection.snapshot.run.researchTarget]);
  const company = companyFor(
    projection.snapshot.run.symbol,
    catalogTicker,
    report?.marketSnapshot ?? liveQuote,
  );
  const history = useMemo<readonly ResearchHistoryGroup[]>(() => {
    return [...new Set(historyRuns.map((run) => run.symbol))].map((symbol) => {
      const ticker = findTicker(symbol);
      const runs = historyRuns.filter((run) => run.symbol === symbol);
      return {
        symbol,
        company:
          symbol === company.symbol
            ? company.company
            : (ticker?.company ?? symbol),
        runs: runs.map((run, index) => ({
          runId: run.runId,
          ...(run.reportId === undefined ? {} : { reportId: run.reportId }),
          label:
            run.question?.trim() || runLabel(run, runs.length - index, locale),
          date: formatResearchHistoryDate(run.createdAt, locale),
          current: run.runId === projection.snapshot.run.runId,
          live:
            run.runId === projection.snapshot.run.runId &&
            (run.status === "queued" ||
              run.status === "running" ||
              run.status === "cancelling"),
          ...(!["failed", "incomplete", "cancelled"].includes(run.status)
            ? {}
            : {
                statusLabel:
                  locale === "ko"
                    ? run.status === "failed"
                      ? "리서치 실패"
                      : run.status === "cancelled"
                        ? "취소됨"
                        : "미완료"
                    : run.status === "failed"
                      ? "Research failed"
                      : run.status === "cancelled"
                        ? "Cancelled"
                        : "Incomplete",
              }),
        })),
      };
    });
  }, [
    company.company,
    company.symbol,
    historyRuns,
    locale,
    projection.snapshot.run.runId,
  ]);
  const completed = projection.state === "published" && report !== undefined;
  const terminal =
    projection.state === "failed" ||
    projection.state === "incomplete" ||
    projection.state === "cancelled";
  const reportFile =
    report === undefined
      ? pendingReport
      : researchReportToFile(
          report,
          projection.snapshot.run.createdAt,
          comparison,
        );

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
    const symbol = projection.snapshot.run.symbol;
    if (
      (projection.snapshot.run.reportId !== undefined &&
        report === undefined) ||
      report?.marketSnapshot !== undefined
    ) {
      setLiveQuote(undefined);
      return;
    }
    const controller = new AbortController();
    setLiveQuote(undefined);
    void fetchResearchQuote(symbol, controller.signal)
      .then(setLiveQuote)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setLiveQuote(undefined);
      });
    return () => controller.abort();
  }, [
    projection.snapshot.run.reportId,
    projection.snapshot.run.symbol,
    report,
  ]);

  useEffect(() => {
    const reportId = projection.snapshot.run.reportId;
    if (reportId === undefined) return;
    let active = true;
    setReportLoadState("loading");
    void loadReport(reportId, reportReload)
      .then((value) => {
        if (active) {
          setReport(value.report);
          setComparison(value.comparison);
          setReportLoadState("idle");
        }
      })
      .catch(() => {
        if (active) {
          setReport(undefined);
          setComparison(undefined);
          setReportLoadState("failed");
        }
      });
    return () => {
      active = false;
    };
  }, [projection.snapshot.run.reportId, reportReload]);

  useEffect(() => {
    if (client.listRuns === undefined) return;
    let active = true;
    void client
      .listRuns(50)
      .then((runs) => {
        if (active) setHistoryRuns(runs);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client]);

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
      data-transcript-open={transcriptOpen ? "true" : "false"}
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
          agents={visibleAgents}
          company={company}
          defaultAgentIds={visibleAgents.map((agent) => agent.id)}
          history={history}
          locale={locale}
          collapsed={!sidebarOpen}
          onCollapsedChange={(collapsed) => setSidebarOpen(!collapsed)}
          onRunSelect={(runId, symbol) =>
            router.push(`/research/${symbol}?run=${runId}&lang=${locale}`)
          }
          onLocaleChange={setLocale}
        />
        <OfficeStage
          current={office.current}
          events={office.events}
          snapshot={snapshot}
          renderPreviousSnapshot={previousSnapshot}
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
          agents={visibleAgents}
          events={office.events}
          locale={locale}
          isComplete={completed}
          {...(terminal ? { terminalState: projection.state } : {})}
          {...(projection.snapshot.run.reportId === undefined
            ? {}
            : { reportId: projection.snapshot.run.reportId })}
          reportVersion={report?.version ?? 1}
          pendingAgentIds={activity.active}
          panelOpen={transcriptOpen}
          onPanelToggle={() => setTranscriptOpen((open) => !open)}
        />
      </div>
      <span className="sr-only" data-testid="public-ledger">
        {office.events.length} durable public events · tick {office.tick}
      </span>
    </div>
  );
}
