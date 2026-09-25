"use client";

import {
  Check,
  FileCheck2,
  Files,
  MessageSquare,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { AppLocale } from "../../lib/i18n";
import { researchProgressCopy } from "../../lib/researchProgressCopy";
import type { PublicRunDetail } from "../../research/client/schemas";
import type { ResearchRunViewState } from "../../research/client/useResearchRun";
import {
  RESEARCH_PROGRESS_STEPS,
  researchProgress,
} from "../../research/researchProgress";
import "../../styles/research-progress-timeline.css";

const icons = [Files, Search, MessageSquare, ShieldCheck, FileCheck2] as const;

export function ResearchProgressTimeline({
  snapshot,
  connection,
  locale,
}: {
  readonly snapshot: PublicRunDetail;
  readonly connection: ResearchRunViewState;
  readonly locale: AppLocale;
}) {
  const progress = researchProgress(snapshot, connection);
  const copy = researchProgressCopy[locale];
  const detail =
    progress.status === "working"
      ? copy[`${progress.step}Detail`]
      : copy[`${progress.status}Detail`];
  return (
    <section
      className="research-progress-timeline"
      aria-label={copy.title}
      lang={locale}
      data-status={progress.status}
      data-stage={progress.step}
    >
      <header>
        <h3>{copy.title}</h3>
        <span className="research-progress-timeline__status">
          <i aria-hidden="true" />
          {copy[progress.status]}
        </span>
      </header>
      <ol>
        {RESEARCH_PROGRESS_STEPS.map((step, index) => {
          const done = progress.published || index < progress.index;
          const current = !progress.published && index === progress.index;
          const Icon = done ? Check : (icons[index] ?? Files);
          return (
            <li
              key={step}
              data-state={done ? "done" : current ? "current" : "upcoming"}
              aria-current={current ? "step" : undefined}
            >
              <span className="research-progress-timeline__node">
                <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="research-progress-timeline__label">
                {copy[step]}
              </span>
              <span className="sr-only">
                {done ? copy.done : current ? copy.current : copy.upcoming}
              </span>
            </li>
          );
        })}
      </ol>
      <p role="status" aria-live="polite" aria-atomic="true">
        {detail}
      </p>
    </section>
  );
}
