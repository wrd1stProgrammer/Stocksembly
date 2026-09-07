"use client";

import "../../styles/signed-in-home.css";
import { ArrowUpRight, FileText, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { type ComponentProps, useEffect, useState } from "react";
import { createAuthenticatedResearchClient } from "../../auth/researchClient";
import {
  type AppLocale,
  copy,
  intlLocale,
  researchLocale,
} from "../../lib/i18n";
import type { PublicRun } from "../../research/client/schemas";
import { MembershipAccessModal } from "../billing/MembershipAccessModal";
import {
  EMPTY_LANDING_RESEARCH_ROOM_PREVIEW,
  type LandingResearchRoomPreviewData,
} from "../researchRoom/landingResearchRoomPreviewSelection";
import { SearchConsole } from "../SearchConsole";

type SignedInHomeProps = Pick<
  ComponentProps<typeof SearchConsole>,
  "locale" | "onOpenPlans" | "subscriptionTier" | "creditsRemaining"
> & {
  readonly communityPreview?: LandingResearchRoomPreviewData;
  readonly localHomePreview?: boolean;
};

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | { readonly status: "ready"; readonly runs: readonly PublicRun[] };

const LOAD_RETRY_DELAYS_MS = [0, 250, 800, 1_600] as const;

function communityTargetLabel(
  report: LandingResearchRoomPreviewData["reports"][number],
  locale: AppLocale,
): string {
  const labels = copy[locale].landing.researchRoom;
  if (report.researchTarget.kind === "committee") return labels.fullCommittee;
  return labels.teams[report.researchTarget.departmentId];
}

export function SignedInHome(props: SignedInHomeProps) {
  const {
    communityPreview = EMPTY_LANDING_RESEARCH_ROOM_PREVIEW,
    localHomePreview = false,
    ...searchConsoleProps
  } = props;
  const { locale } = searchConsoleProps;
  const content = copy[locale].home;
  const roomLabels = copy[locale].landing.researchRoom;
  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
  });
  const [membershipGateOpen, setMembershipGateOpen] = useState(false);
  const { status: loadStatus } = loadState;

  useEffect(() => {
    if (loadStatus !== "loading") return;
    if (process.env.NODE_ENV === "development" && localHomePreview) {
      setLoadState({ status: "ready", runs: [] });
      return;
    }
    const client = createAuthenticatedResearchClient();
    let active = true;
    let retryTimer: number | undefined;

    async function loadRuns(attempt: number): Promise<void> {
      try {
        // Cognito can still be restoring the browser session on first render.
        await client.bootstrapSession();
        if (!active) return;
        const runs = await client.listRuns?.(12);
        if (active) setLoadState({ status: "ready", runs: runs ?? [] });
      } catch {
        if (!active) return;
        const nextDelay = LOAD_RETRY_DELAYS_MS[attempt + 1];
        if (nextDelay === undefined) {
          setLoadState({ status: "failed" });
          return;
        }
        retryTimer = window.setTimeout(() => {
          void loadRuns(attempt + 1);
        }, nextDelay);
      }
    }

    void loadRuns(0);
    return () => {
      active = false;
      window.clearTimeout(retryTimer);
    };
  }, [loadStatus, localHomePreview]);

  const dateFormatter = new Intl.DateTimeFormat(intlLocale(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const communityReports = communityPreview.reports;

  return (
    <div className="signed-in-home">
      <section
        className="signed-in-home__start"
        aria-labelledby="signed-in-home-title"
      >
        <div className="signed-in-home__intro">
          <h1 id="signed-in-home-title">{content.title}</h1>
          <p>{content.description}</p>
        </div>
        <SearchConsole {...searchConsoleProps} />
      </section>

      <section
        className="signed-in-home__research"
        aria-labelledby="signed-in-home-research-title"
      >
        <header className="signed-in-home__section-head">
          <div>
            <span>{content.myEyebrow}</span>
            <h2 id="signed-in-home-research-title">{content.researchTitle}</h2>
          </div>
        </header>
        {loadState.status === "loading" ? (
          <div className="signed-in-home__loading" role="status">
            <span className="sr-only">{content.loading}</span>
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </div>
        ) : loadState.status === "failed" ? (
          <div className="signed-in-home__message">
            <p role="alert">{content.error}</p>
            <button
              type="button"
              className="signed-in-home__retry"
              onClick={() => {
                setLoadState({ status: "loading" });
              }}
            >
              {content.retry}
            </button>
          </div>
        ) : loadState.runs.length === 0 ? (
          <div className="signed-in-home__message" role="status">
            <FileText size={24} aria-hidden="true" />
            <strong>{content.emptyTitle}</strong>
            <p>{content.emptyDescription}</p>
          </div>
        ) : (
          <ol className="signed-in-home__runs">
            {loadState.runs.map((run) => (
              <li key={run.runId}>
                <Link
                  className="signed-in-home__run"
                  href={`/research/${run.symbol}?run=${run.runId}&lang=${locale}`}
                >
                  <span className="signed-in-home__run-content">
                    <strong>{run.symbol}</strong>
                    {run.question ? (
                      <span className="signed-in-home__question">
                        {run.question}
                      </span>
                    ) : null}
                  </span>
                  <span className="signed-in-home__run-meta">
                    <span
                      className="signed-in-home__status"
                      data-status={run.status}
                    >
                      {content.statuses[run.status]}
                    </span>
                    <time dateTime={run.createdAt}>
                      {dateFormatter.format(new Date(run.createdAt))}
                    </time>
                  </span>
                  <ArrowUpRight
                    className="signed-in-home__run-arrow"
                    size={18}
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      {communityReports.length === 0 ? null : (
        <section
          className="signed-in-home__research signed-in-home__community"
          aria-labelledby="signed-in-home-community-title"
        >
          <header className="signed-in-home__section-head">
            <div>
              <span>{content.community.eyebrow}</span>
              <h2 id="signed-in-home-community-title">
                {content.community.title}
              </h2>
              <p>{content.community.description}</p>
            </div>
            <Link
              className="signed-in-home__section-link"
              href={`/research-room?lang=${locale}`}
            >
              {content.community.browse}
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </header>
          <ol className="signed-in-home__runs">
            {communityReports.map((report) => {
              const rowContent = (
                <>
                  <span className="signed-in-home__run-content">
                    <strong>{report.symbol}</strong>
                    <span className="signed-in-home__question">
                      {report.question}
                    </span>
                  </span>
                  <span className="signed-in-home__run-meta">
                    <span className="signed-in-home__status">
                      {communityTargetLabel(report, locale)}
                    </span>
                    <time dateTime={report.publishedAt}>
                      {dateFormatter.format(new Date(report.publishedAt))}
                    </time>
                  </span>
                </>
              );
              return (
                <li key={report.reportId}>
                  {report.locked ? (
                    <button
                      type="button"
                      className="signed-in-home__run signed-in-home__run--locked"
                      aria-label={`${report.symbol} · ${roomLabels.locked}`}
                      onClick={() => setMembershipGateOpen(true)}
                    >
                      {rowContent}
                      <LockKeyhole
                        className="signed-in-home__run-arrow"
                        size={16}
                        aria-hidden="true"
                      />
                    </button>
                  ) : (
                    <Link
                      className="signed-in-home__run"
                      href={`/research-room/${report.reportId}?lang=${locale}`}
                    >
                      {rowContent}
                      <ArrowUpRight
                        className="signed-in-home__run-arrow"
                        size={18}
                        aria-hidden="true"
                      />
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
          <MembershipAccessModal
            locale={researchLocale(locale)}
            open={membershipGateOpen}
            reason="recent-report"
            onClose={() => setMembershipGateOpen(false)}
            onOpenPlans={props.onOpenPlans}
          />
        </section>
      )}
    </div>
  );
}
