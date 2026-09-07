"use client";
import { ArrowUpRight } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createAuthenticatedResearchClient } from "../../auth/researchClient";
import { type AppLocale, copy, researchLocale } from "../../lib/i18n";
import type { PublicRun, PublicRunDetail } from "../../research/client/schemas";
import { useResearchRun } from "../../research/client/useResearchRun";
import { useLiveOfficeAnimation } from "../../research/liveOfficeAnimation";
import { liveOfficeProjection } from "../../research/liveOfficeProjection";
import { useOfficePresentation } from "../../research/useOfficePresentation";

const Office = dynamic(
  () =>
    import("../research/PixelOfficeGame").then(
      (module) => module.PixelOfficeGame,
    ),
  { ssr: false },
);

function LiveActivity({
  initial,
  locale,
  onRunChange,
}: {
  initial: PublicRunDetail;
  onRunChange: (run: PublicRun) => void;
  locale: AppLocale;
}) {
  const client = useMemo(() => createAuthenticatedResearchClient(), []);
  const projection = useResearchRun(initial, { client });
  useEffect(() => {
    onRunChange(projection.snapshot.run);
  }, [onRunChange, projection.snapshot.run]);
  const office = useMemo(
    () => liveOfficeProjection(projection.snapshot),
    [projection.snapshot],
  );
  const running = ["queued", "running", "cancelling"].includes(
    projection.snapshot.run.status,
  );
  const presentation = useOfficePresentation(
    office.events,
    initial.run.runId,
    false,
    {
      restore: true,
      terminal: !running,
      syncRevision: projection.syncRevision,
    },
  );
  const [ready, setReady] = useState(false);
  const animation = useLiveOfficeAnimation(
    presentation.tick,
    office.departmentReleaseOrder,
    ready,
    true,
    true,
    presentation.snapToProgress,
  );
  const ko = locale === "ko";
  const run = projection.snapshot.run;
  return (
    <>
      <div className="home-activity__body">
        <div className="home-activity__copy">
          <span className="daily-eyebrow">
            {run.symbol} / {copy[locale].home.statuses[run.status]}
          </span>
          <h3>
            {run.question ||
              (ko
                ? "팀이 근거를 검토하고 있습니다."
                : "Your team is reviewing the evidence.")}
          </h3>
          <p aria-live="polite">
            {projection.state === "connection-interrupted"
              ? ko
                ? "연결을 복구하고 있습니다. 마지막 확인 상태를 표시합니다."
                : "Reconnecting. Showing the last confirmed update."
              : office.current.summary[researchLocale(locale)]}
          </p>
          <Link
            className="daily-text-link"
            href={`/research/${run.symbol}?run=${run.runId}&lang=${locale}`}
          >
            {running
              ? ko
                ? "리서치 오피스 열기"
                : "Open research office"
              : ko
                ? "결과 확인하기"
                : "View the result"}
            <ArrowUpRight size={16} />
          </Link>
        </div>
        {running ? (
          <div className="home-activity__office">
            <Office
              locale={researchLocale(locale)}
              isPaused={false}
              presentation={presentation.presentation}
              currentEvent={presentation.current}
              events={presentation.events}
              snapshot={animation.snapshot}
              renderPreviousSnapshot={animation.previousSnapshot}
              renderInterpolationAlpha={animation.interpolation}
              onReady={() => setReady(true)}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}

export function HomeResearchActivity({
  run,
  locale,
  onRunChange,
}: {
  run: PublicRun;
  onRunChange: (run: PublicRun) => void;
  locale: AppLocale;
}) {
  const [detail, setDetail] = useState<PublicRunDetail>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void createAuthenticatedResearchClient()
      .getRun(run.runId)
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [run.runId]);
  return (
    <section
      className="home-activity"
      aria-label={locale === "ko" ? "진행 중인 리서치" : "Active research"}
    >
      <header className="daily-section-head">
        <div>
          <span className="daily-eyebrow">RESEARCH IN MOTION</span>
          <h2>
            {locale === "ko" ? "팀이 일하고 있습니다." : "Your team is on it."}
          </h2>
        </div>
        <span className="home-live-dot">{run.symbol}</span>
      </header>
      {detail ? (
        <LiveActivity
          initial={detail}
          locale={locale}
          onRunChange={onRunChange}
        />
      ) : (
        <p role="status">
          {failed
            ? locale === "ko"
              ? "진행 상태를 불러오지 못했습니다."
              : "Unable to load the current activity."
            : locale === "ko"
              ? "오피스를 연결하고 있습니다…"
              : "Connecting to your office…"}{" "}
          <Link
            href={`/research/${run.symbol}?run=${run.runId}&lang=${locale}`}
          >
            {locale === "ko" ? "오피스 열기" : "Open office"} ↗
          </Link>
        </p>
      )}
    </section>
  );
}
