"use client";

import "../../styles/signed-in-home.css";
import { ArrowUpRight, FileText } from "lucide-react";
import Link from "next/link";
import { type ComponentProps, useEffect, useState } from "react";
import { createAuthenticatedResearchClient } from "../../auth/researchClient";
import { copy, intlLocale } from "../../lib/i18n";
import type { PublicRun } from "../../research/client/schemas";
import { SearchConsole } from "../SearchConsole";

type SignedInHomeProps = Pick<
  ComponentProps<typeof SearchConsole>,
  "locale" | "onOpenPlans" | "subscriptionTier" | "creditsRemaining"
>;

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | { readonly status: "ready"; readonly runs: readonly PublicRun[] };

const LOAD_RETRY_DELAYS_MS = [0, 250, 800, 1_600] as const;

export function SignedInHome(props: SignedInHomeProps) {
  const { locale } = props;
  const content = copy[locale].home;
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const { status: loadStatus } = loadState;

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
  }, [loadStatus]);

  const dateFormatter = new Intl.DateTimeFormat(intlLocale(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

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
        <SearchConsole {...props} />
      </section>

      <section
        className="signed-in-home__research"
        aria-labelledby="signed-in-home-research-title"
      >
        <h2 id="signed-in-home-research-title">{content.researchTitle}</h2>
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
    </div>
  );
}
