import { ArrowUpRight, BellRing, Clock3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { BriefingRoomState } from "../../briefing/domain/contracts";
import type { Locale } from "../../lib/i18n";
import { Brand } from "../Brand";
import {
  formatBriefingDate,
  formatBriefingDateInZone,
} from "./briefingFormatting";

type HeaderProps = {
  readonly state: BriefingRoomState;
  readonly locale: Locale;
};

const copy = {
  ko: {
    title: "브리핑룸",
    eyebrow: "미국 장 시작 1시간 전",
    latest: "최신 발행",
    next: "다음 발행",
    eastern: "미 동부시간",
    local: "한국시간",
    countdown: "남은 시간",
    lockedTitle: "매일의 변화만 빠르게 확인하세요",
    lockedBody:
      "Pro는 3개, Ultra는 10개 관심종목에 대해 거래일마다 프리마켓 브리핑을 제공합니다.",
    plan: "플랜 확인하기",
  },
  en: {
    title: "Briefing room",
    eyebrow: "One hour before the US open",
    latest: "Latest edition",
    next: "Next edition",
    eastern: "America/New_York",
    local: "Your time",
    countdown: "Time remaining",
    lockedTitle: "See only what changed before the open",
    lockedBody:
      "Pro includes 3 watchlist names and Ultra includes 10, with a briefing every US trading day.",
    plan: "View plans",
  },
} as const;

function countdownLabel(milliseconds: number, locale: Locale): string {
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
  const labels = copy[locale];
  const [now, setNow] = useState<number>();
  const [localTimeZone, setLocalTimeZone] = useState(
    locale === "ko" ? "Asia/Seoul" : "UTC",
  );
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    if (locale === "en")
      setLocalTimeZone(
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
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
      <div>
        {!state.authenticated ? <Brand locale={locale} /> : null}
        <span>{labels.eyebrow}</span>
        <h1>{labels.title}</h1>
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
  readonly locale: Locale;
  readonly onOpenPlans: () => void;
}) {
  const labels = copy[locale];
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
