"use client";
import "../../styles/signed-in-home.css";
import { ArrowRight, ArrowUpRight, LockKeyhole } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { type ComponentProps, useEffect, useRef, useState } from "react";
import { createAuthenticatedResearchClient } from "../../auth/researchClient";
import { copy, intlLocale, researchLocale } from "../../lib/i18n";
import type { PublicRun } from "../../research/client/schemas";
import { MembershipAccessModal } from "../billing/MembershipAccessModal";
import {
  EMPTY_LANDING_RESEARCH_ROOM_PREVIEW,
  type LandingResearchRoomPreviewData,
} from "../researchRoom/landingResearchRoomPreviewSelection";
import { SearchConsole } from "../SearchConsole";

const HomeResearchActivity = dynamic(
  () =>
    import("./HomeResearchActivity").then(
      (module) => module.HomeResearchActivity,
    ),
  { ssr: false },
);

type SignedInHomeProps = Pick<
  ComponentProps<typeof SearchConsole>,
  "locale" | "onOpenPlans" | "subscriptionTier" | "creditsRemaining"
> & {
  readonly communityPreview?: LandingResearchRoomPreviewData;
};
type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | { readonly status: "ready"; readonly runs: readonly PublicRun[] };
const LOAD_RETRY_DELAYS_MS = [0, 250, 800, 1_600] as const;

export function SignedInHome(props: SignedInHomeProps) {
  const {
    communityPreview = EMPTY_LANDING_RESEARCH_ROOM_PREVIEW,
    ...searchConsoleProps
  } = props;
  const { locale } = searchConsoleProps;
  const ko = locale === "ko";
  const content = copy[locale].home;
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [membershipGateOpen, setMembershipGateOpen] = useState(false);
  const { status: loadStatus } = loadState;
  const trackedRun = useRef<string | undefined>(undefined);
  const [runs, setRuns] = useState<readonly PublicRun[]>([]);
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(
      new Intl.DateTimeFormat(intlLocale(locale), {
        month: "long",
        day: "numeric",
        weekday: "long",
      }).format(new Date()),
    );
  }, [locale]);
  useEffect(() => {
    if (loadStatus !== "loading") return;
    const client = createAuthenticatedResearchClient();
    let active = true;
    let retryTimer: number | undefined;

    async function loadRuns(attempt: number): Promise<void> {
      try {
        // Cognito can still be restoring the browser session on first render.
        await client.bootstrapSession();
        if (!active) return;
        const runs = await client.listRuns?.(12);
        if (active) {
          setRuns(runs ?? []);
          setLoadState({ status: "ready", runs: runs ?? [] });
        }
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
  }, [loadStatus]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible")
        setLoadState((current) =>
          current.status === "ready" ? { status: "loading" } : current,
        );
    };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const activeRun =
    runs.find((run) =>
      ["queued", "running", "cancelling"].includes(run.status),
    ) ?? runs.find((run) => run.runId === trackedRun.current);
  useEffect(() => {
    if (activeRun) trackedRun.current = activeRun.runId;
  }, [activeRun]);
  const communityReports = communityPreview.reports.slice(0, 3);
  return (
    <div className="signed-in-home daily-home" id="product">
      <header className="daily-home__masthead">
        <span>
          <i /> MY WORKSPACE
        </span>
        <time>{today}</time>
      </header>
      <section
        className="signed-in-home__start"
        aria-labelledby="signed-in-home-title"
      >
        <div className="signed-in-home__intro">
          <span className="daily-eyebrow">START WITH A QUESTION</span>
          <h1 id="signed-in-home-title">{content.title}</h1>
          <p>{content.description}</p>
        </div>
        <SearchConsole {...searchConsoleProps} />
      </section>
      {activeRun ? (
        <HomeResearchActivity
          key={activeRun.runId}
          run={activeRun}
          locale={locale}
        />
      ) : null}
      {loadState.status === "failed" ? (
        <div className="daily-feedback daily-feedback--activity" role="alert">
          <p>
            {ko
              ? "진행 중인 리서치를 확인하지 못했습니다."
              : "Unable to check for active research."}
          </p>
          <button
            type="button"
            onClick={() => setLoadState({ status: "loading" })}
          >
            {content.retry}
          </button>
        </div>
      ) : null}
      {communityReports.length ? (
        <section
          className="home-questions"
          aria-labelledby="home-questions-title"
        >
          <header className="daily-section-head">
            <div>
              <span className="daily-eyebrow">
                01 / A DIFFERENT PERSPECTIVE
              </span>
              <h2 id="home-questions-title">
                {ko
                  ? "다른 투자자는 무엇을 묻고 있을까요?"
                  : "What are other investors asking?"}
              </h2>
            </div>
            <Link href={`/research-room?lang=${locale}`}>
              {ko ? "더 많은 질문" : "More questions"}
              <ArrowUpRight size={15} />
            </Link>
          </header>
          <ol>
            {communityReports.map((report, index) => {
              const inside = (
                <>
                  <div className="home-question__meta">
                    <span>{report.symbol}</span>
                    <small>0{index + 1}</small>
                  </div>
                  <h3>{report.question}</h3>
                  <footer>
                    <span>
                      {report.researchTarget.kind === "committee"
                        ? copy[locale].landing.researchRoom.fullCommittee
                        : copy[locale].landing.researchRoom.teams[
                            report.researchTarget.departmentId
                          ]}
                    </span>
                    {report.locked ? (
                      <LockKeyhole size={15} />
                    ) : (
                      <ArrowUpRight size={18} />
                    )}
                  </footer>
                </>
              );
              return (
                <li key={report.reportId}>
                  {report.locked ? (
                    <button
                      type="button"
                      onClick={() => setMembershipGateOpen(true)}
                      aria-label={`${report.symbol} · ${copy[locale].landing.researchRoom.locked}`}
                    >
                      {inside}
                    </button>
                  ) : (
                    <Link
                      href={`/research-room/${report.reportId}?lang=${locale}`}
                    >
                      {inside}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
      <footer className="daily-home__footer">
        <span>
          STOCKSEMBLY <i /> RESEARCH, WITH PERSPECTIVE.
        </span>
        <Link href={`/methodology?lang=${locale}`}>
          {ko ? "리서치 방법론" : "Our methodology"}
          <ArrowRight size={13} />
        </Link>
      </footer>
      <MembershipAccessModal
        locale={researchLocale(locale)}
        open={membershipGateOpen}
        reason="recent-report"
        onClose={() => setMembershipGateOpen(false)}
        onOpenPlans={props.onOpenPlans}
      />
    </div>
  );
}
