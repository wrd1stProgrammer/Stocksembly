import { ArrowUpRight, BellRing, Clock3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { BriefingRoomState } from "../../briefing/domain/contracts";
import type { AppLocale } from "../../lib/i18n";
import { HeaderAuthAction } from "../auth/HeaderAuthAction";
import { Brand } from "../Brand";
import {
  formatBriefingDate,
  formatBriefingDateInZone,
} from "./briefingFormatting";
import { briefingRoomUiCopy } from "./briefingRoomUiCopy";

type HeaderProps = {
  readonly state: BriefingRoomState;
  readonly locale: AppLocale;
};

function countdownLabel(milliseconds: number, locale: AppLocale): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const clock = [hours, minutes]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
  if (days === 0) return clock;
  return locale === "ko" ? `${days}일 ${clock}` : `${days}d ${clock}`;
}

export function BriefingRoomHeader({ state, locale }: HeaderProps) {
  const labels = briefingRoomUiCopy[locale].header;
  const [now, setNow] = useState<number>();
  const [localTimeZone, setLocalTimeZone] = useState(
    locale === "ko" ? "Asia/Seoul" : "UTC",
  );
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    setLocalTimeZone(
      locale === "ko"
        ? "Asia/Seoul"
        : Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    );
    return () => window.clearInterval(timer);
  }, [locale]);
  const latestPublishedAt = useMemo(
    () =>
      state.briefings.reduce<string | undefined>((latest, briefing) => {
        if (latest === undefined) return briefing.generatedAt;
        return Date.parse(briefing.generatedAt) > Date.parse(latest)
          ? briefing.generatedAt
          : latest;
      }, undefined),
    [state.briefings],
  );
  const countdown =
    now === undefined
      ? "--:--"
      : countdownLabel(Date.parse(state.nextBriefingAt) - now, locale);

  return (
    <header className="briefing-room__topbar">
      <div className="briefing-room__identity">
        <div>
          {!state.authenticated ? <Brand locale={locale} /> : null}
          <span>{labels.eyebrow}</span>
          <h1>{labels.title}</h1>
        </div>
        {state.authenticated ? null : (
          <HeaderAuthAction label={labels.getStarted} locale={locale} />
        )}
      </div>
      <div className="briefing-room__publishing">
        {latestPublishedAt === undefined ? null : (
          <div className="briefing-room__freshness">
            <span>{labels.latest}</span>
            <strong>
              {formatBriefingDate(latestPublishedAt, locale, true)}
            </strong>
            <small>{labels.eastern}</small>
          </div>
        )}
        <div className="briefing-room__next">
          <Clock3 size={14} />
          <div>
            <span>{labels.next}</span>
            <strong>
              {formatBriefingDate(state.nextBriefingAt, locale, true)}
            </strong>
            <small>
              {labels.local}{" "}
              {formatBriefingDateInZone(
                state.nextBriefingAt,
                locale,
                localTimeZone,
                true,
              )}
            </small>
          </div>
          <div className="briefing-room__countdown">
            <span>{labels.countdown}</span>
            <time>{countdown}</time>
          </div>
        </div>
      </div>
    </header>
  );
}

export function BriefingLocked({
  locale,
  onOpenPlans,
}: {
  readonly locale: AppLocale;
  readonly onOpenPlans: () => void;
}) {
  const labels = briefingRoomUiCopy[locale].header;
  return (
    <section className="briefing-room__locked">
      <BellRing size={30} />
      <span>{labels.eyebrow}</span>
      <h2>{labels.lockedTitle}</h2>
      <p>{labels.lockedBody}</p>
      <button type="button" onClick={onOpenPlans}>
        {labels.plan} <ArrowUpRight size={15} />
      </button>
    </section>
  );
}
