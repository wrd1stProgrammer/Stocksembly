"use client";

import { ArrowUpRight, Clock, SidebarSimple, X } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createAuthenticatedResearchClient } from "../../auth/researchClient";
import type { AppLocale } from "../../lib/i18n";
import { intlLocale } from "../../lib/i18n";
import type { PublicRun } from "../../research/client/schemas";

type LoadState = "idle" | "loading" | "ready" | "failed";

const LOAD_RETRY_DELAYS_MS = [0, 250, 800, 1_600] as const;

async function wait(delayMs: number): Promise<void> {
  if (delayMs === 0) return;
  await new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

function statusCopy(
  status: PublicRun["status"],
  locale: AppLocale,
): { readonly label: string; readonly tone: "live" | "done" | "stopped" } {
  switch (status) {
    case "queued":
      return {
        label: locale === "ko" ? "대기 중" : "Queued",
        tone: "live",
      };
    case "running":
      return {
        label: locale === "ko" ? "분석 중" : "Researching",
        tone: "live",
      };
    case "cancelling":
      return {
        label: locale === "ko" ? "취소 중" : "Cancelling",
        tone: "live",
      };
    case "completed":
      return {
        label: locale === "ko" ? "완료" : "Complete",
        tone: "done",
      };
    case "complete-with-limitations":
      return {
        label: locale === "ko" ? "완료" : "Complete",
        tone: "done",
      };
    case "cancelled":
      return {
        label: locale === "ko" ? "취소됨" : "Cancelled",
        tone: "stopped",
      };
    case "failed":
      return {
        label: locale === "ko" ? "실패" : "Failed",
        tone: "stopped",
      };
    case "incomplete":
      return {
        label: locale === "ko" ? "미완료" : "Incomplete",
        tone: "stopped",
      };
  }
}

function createdAtLabel(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function RecentResearchDrawer({
  locale,
}: {
  readonly locale: AppLocale;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [runs, setRuns] = useState<readonly PublicRun[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");

  const loadRuns = useCallback(async () => {
    setLoadState("loading");
    const client = createAuthenticatedResearchClient();
    let lastError: unknown;

    for (const delayMs of LOAD_RETRY_DELAYS_MS) {
      await wait(delayMs);
      try {
        // Cognito may still be restoring its browser session when the header
        // first renders. Establish the research session before reading runs.
        await client.bootstrapSession();
        const recent = await client.listRuns?.(8);
        setRuns(recent ?? []);
        setLoadState("ready");
        return;
      } catch (error) {
        lastError = error;
      }
    }

    if (process.env.NODE_ENV !== "production")
      console.error("RECENT_RESEARCH_LOAD_FAILED", lastError);
    setLoadState("failed");
  }, []);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open && loadState === "idle") void loadRuns();
  }, [loadRuns, loadState, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="header-research-trigger"
        aria-label={
          locale === "ko" ? "최근 리서치 열기" : "Open recent research"
        }
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <SidebarSimple size={20} weight={open ? "fill" : "regular"} />
      </button>
      {mounted && open
        ? createPortal(
            <div className="recent-research-layer">
              <button
                type="button"
                className="recent-research-layer__backdrop"
                aria-label={
                  locale === "ko" ? "최근 리서치 닫기" : "Close recent research"
                }
                onClick={() => setOpen(false)}
              />
              <aside
                className="recent-research-drawer"
                role="dialog"
                aria-modal="true"
                aria-labelledby="recent-research-title"
              >
                <header>
                  <div>
                    <span>
                      {locale === "ko" ? "내 리서치" : "Your research"}
                    </span>
                    <h2 id="recent-research-title">
                      {locale === "ko" ? "최근 분석" : "Recent analysis"}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label={locale === "ko" ? "닫기" : "Close"}
                  >
                    <X size={18} />
                  </button>
                </header>

                <div className="recent-research-drawer__body">
                  {loadState === "loading" || loadState === "idle" ? (
                    <div
                      className="recent-research-drawer__loading"
                      role="status"
                    >
                      <i />
                      <i />
                      <i />
                      <span className="sr-only">
                        {locale === "ko"
                          ? "최근 리서치를 불러오는 중"
                          : "Loading recent research"}
                      </span>
                    </div>
                  ) : loadState === "failed" ? (
                    <div className="recent-research-drawer__empty">
                      <strong>
                        {locale === "ko"
                          ? "기록을 불러오지 못했습니다."
                          : "Could not load your research."}
                      </strong>
                      <button type="button" onClick={() => void loadRuns()}>
                        {locale === "ko" ? "다시 시도" : "Try again"}
                      </button>
                    </div>
                  ) : runs.length === 0 ? (
                    <div className="recent-research-drawer__empty">
                      <Clock size={24} />
                      <strong>
                        {locale === "ko"
                          ? "아직 생성한 리서치가 없습니다."
                          : "No research yet."}
                      </strong>
                      <span>
                        {locale === "ko"
                          ? "홈에서 첫 분석을 시작해 보세요."
                          : "Start your first analysis from the home page."}
                      </span>
                    </div>
                  ) : (
                    <ol className="recent-research-list">
                      {runs.map((run) => {
                        const status = statusCopy(run.status, locale);
                        return (
                          <li key={run.runId}>
                            <Link
                              href={`/research/${run.symbol}?run=${run.runId}&lang=${locale}`}
                              onClick={() => setOpen(false)}
                              aria-label={`${run.symbol} · ${status.label} · ${createdAtLabel(run.createdAt, locale)}`}
                            >
                              <span className="recent-research-list__symbol">
                                {run.symbol.slice(0, 1)}
                              </span>
                              <span className="recent-research-list__content">
                                <span>
                                  <strong>{run.symbol}</strong>
                                  <small data-tone={status.tone}>
                                    {status.label}
                                  </small>
                                </span>
                                <time dateTime={run.createdAt}>
                                  {createdAtLabel(run.createdAt, locale)}
                                </time>
                              </span>
                              <ArrowUpRight size={16} aria-hidden="true" />
                            </Link>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
                <footer>
                  {locale === "ko"
                    ? "항목을 선택하면 해당 리서치 화면으로 이동합니다."
                    : "Select an item to open its research workspace."}
                </footer>
              </aside>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
