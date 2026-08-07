"use client";

import { BorderBeam } from "border-beam";
import {
  ArrowUpRight,
  BellRing,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  Clock3,
  Minus,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type {
  BriefingDecisionCheck,
  BriefingEarningsSnapshot,
  BriefingEditionPayload,
  BriefingListItem,
  BriefingRoomState,
  BriefingWatchlistItem,
} from "../../briefing/domain/contracts";
import type { Locale } from "../../lib/i18n";
import { Brand } from "../Brand";
import { MobileBottomNav } from "../MobileBottomNav";
import { CompanyLogo } from "../research/ResearchSidebar";
import { SignedInSidebar } from "../SignedInSidebar";
import { DotsRing } from "../ui/dots-ring";

type Props = {
  readonly initialState: BriefingRoomState;
  readonly locale: Locale;
  readonly initialDetails?: Readonly<Record<string, BriefingEditionPayload>>;
};

type TickerResult = {
  readonly symbol: string;
  readonly providerCode: string;
  readonly company: string;
  readonly exchange: string;
};

const BRIEFINGS_READ_EVENT = "stocksembly:briefings-read";

function LatestBriefingCard({
  latest,
  children,
}: {
  readonly latest: boolean;
  readonly children: ReactNode;
}) {
  if (!latest) return children;
  return (
    <BorderBeam
      className="briefing-card__latest-beam"
      size="pulse-inner"
      colorVariant="mono"
      strength={0.78}
      borderRadius={12}
    >
      {children}
    </BorderBeam>
  );
}

const text = {
  ko: {
    title: "브리핑룸",
    eyebrow: "미국 장 시작 1시간 전",
    watchlist: "관심종목",
    add: "종목 추가",
    search: "티커 또는 기업 검색",
    next: "다음 브리핑",
    eastern: "미 동부시간 기준",
    localTime: "한국시간",
    tradingDays: "미국 거래일 기준",
    countdown: "발행까지",
    earnings: "다음 실적",
    earningsPending: "일정 미확정",
    confirmed: "확정",
    latest: "NEW",
    remainingChanges: "남은 변경 횟수",
    times: "회",
    all: "전체",
    emptyTitle: "첫 브리핑을 준비할 종목을 추가하세요",
    emptyBody:
      "새 브리핑은 직전 발행 이후의 변화와 다음 실적 일정을 전일 내용과 겹치지 않게 정리합니다.",
    noEditionTitle: "다음 프리마켓 브리핑부터 시작됩니다",
    noEditionBody:
      "관심종목 등록이 끝났습니다. 다음 미국 거래일 장 시작 한 시간 전에 새 브리핑이 도착합니다.",
    lockedTitle: "매일의 변화만 빠르게 확인하세요",
    lockedBody:
      "Pro는 3개, Ultra는 10개 관심종목에 대해 거래일마다 프리마켓 브리핑을 제공합니다.",
    plan: "플랜 확인하기",
    today: "오늘의 판정 기준",
    changes: "지난 24시간의 변화",
    extendedChanges: "주말·휴장 누적 변화",
    noChanges: "전일 브리핑 이후 투자 판단을 바꿀 새 사건은 없습니다.",
    agents: "에이전트 관점",
    scenario: "상·하방 경로",
    bull: "상방 경로",
    bear: "하방 경로",
    upcoming: "예정 이벤트",
    since: "전일 브리핑 이후",
    remove: "관심종목에서 삭제",
    observe: "관찰 지표",
    pass: "통과하면",
    fail: "실패하면",
    earningsSnapshot: "실적 스냅샷",
    latestRelease: "최근 발표",
    latestEps: "최근 EPS",
    latestRevenue: "최근 분기 매출",
    consensus: "당시 컨센서스",
    epsSurprise: "EPS 서프라이즈",
    revenueSurprise: "매출 서프라이즈",
    nextEpsConsensus: "다음 EPS 컨센서스",
    nextRevenueConsensus: "다음 매출 컨센서스",
  },
  en: {
    title: "Briefing room",
    eyebrow: "One hour before the US open",
    watchlist: "Watchlist",
    add: "Add stock",
    search: "Search ticker or company",
    next: "Next briefing",
    eastern: "America/New_York",
    localTime: "Your time",
    tradingDays: "US trading days only",
    countdown: "publishes in",
    earnings: "Next earnings",
    earningsPending: "Date pending",
    confirmed: "Confirmed",
    latest: "NEW",
    remainingChanges: "Changes remaining",
    times: "",
    all: "All",
    emptyTitle: "Add a stock for its first briefing",
    emptyBody:
      "Each edition isolates changes since the prior release and the next earnings date without repeating yesterday's brief.",
    noEditionTitle: "Briefings begin at the next pre-market run",
    noEditionBody:
      "Your watchlist is ready. A new edition arrives one hour before the next US market open.",
    lockedTitle: "See only what changed before the open",
    lockedBody:
      "Pro includes 3 watchlist names and Ultra includes 10, with a briefing every US trading day.",
    plan: "View plans",
    today: "Today's decision rules",
    changes: "What changed in 24 hours",
    extendedChanges: "Weekend & holiday catch-up",
    noChanges:
      "No new event since the prior briefing changes the investment view.",
    agents: "Agent views",
    scenario: "Upside and downside paths",
    bull: "Upside path",
    bear: "Downside path",
    upcoming: "Upcoming events",
    since: "Since the prior briefing",
    remove: "Remove from watchlist",
    observe: "Observe",
    pass: "If confirmed",
    fail: "If it fails",
    earningsSnapshot: "Earnings snapshot",
    latestRelease: "Latest release",
    latestEps: "Latest EPS",
    latestRevenue: "Latest quarterly revenue",
    consensus: "Street consensus",
    epsSurprise: "EPS surprise",
    revenueSurprise: "Revenue surprise",
    nextEpsConsensus: "Next EPS consensus",
    nextRevenueConsensus: "Next revenue consensus",
  },
} as const;

function formatDateInZone(
  value: string,
  locale: Locale,
  timeZone: string,
  includeTime = false,
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
    ...(includeTime
      ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
      : {}),
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  const month = Number(part("month"));
  const day = Number(part("day"));
  const time = includeTime ? ` ${part("hour")}:${part("minute")}` : "";
  if (locale === "ko") return `${month}월 ${day}일${time}`;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ] as const;
  return `${months[month - 1] ?? ""} ${day}${time}`;
}

function formatDate(value: string, locale: Locale, includeTime = false) {
  return formatDateInZone(value, locale, "America/New_York", includeTime);
}

function countdownLabel(milliseconds: number, locale: Locale): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const clock = [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
  if (days === 0) return clock;
  return locale === "ko" ? `${days}일 ${clock}` : `${days}d ${clock}`;
}

function isDecisionCheck(
  value: BriefingDecisionCheck | string,
): value is BriefingDecisionCheck {
  return typeof value !== "string";
}

function hasExtendedCoverage(briefing: BriefingEditionPayload): boolean {
  return (
    Date.parse(briefing.cutoffAt) - Date.parse(briefing.coverageStart) >
    36 * 60 * 60 * 1_000
  );
}

function earningsCurrency(
  value: number,
  earnings: BriefingEarningsSnapshot,
  compact = false,
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: earnings.currency ?? "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 2,
  }).format(value);
}

function earningsPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function confirmedEarningsForPayload(payload: BriefingEditionPayload) {
  const event = payload.upcomingEvents.find(
    (candidate) =>
      candidate.certainty === "confirmed" &&
      /earnings|results|실적/iu.test(candidate.name),
  );
  if (event !== undefined) return event;
  if (
    payload.earnings?.nextReportAt === undefined ||
    payload.earnings.nextReportCertainty !== "confirmed"
  )
    return undefined;
  return {
    name: "Earnings",
    scheduledAt: payload.earnings.nextReportAt,
    whyItMatters: "",
    certainty: "confirmed" as const,
  };
}

function visibleUpcomingEvents(payload: BriefingEditionPayload) {
  return payload.upcomingEvents.filter(
    (event) =>
      event.certainty === "confirmed" ||
      !/earnings|results|실적/iu.test(event.name),
  );
}

const agentPresentation = {
  market: {
    portrait: "/research/office-v7/portraits/market.png",
    name: { ko: "마야", en: "Maya" },
  },
  company: {
    portrait: "/research/office-v7/portraits/company.png",
    name: { ko: "이든", en: "Ethan" },
  },
  financial: {
    portrait: "/research/office-v7/portraits/financial.png",
    name: { ko: "노아", en: "Noah" },
  },
  risk: {
    portrait: "/research/office-v7/portraits/risk_policy.png",
    name: { ko: "민", en: "Min" },
  },
} as const;

function priceLabel(briefing: BriefingListItem) {
  const value = briefing.price.value;
  if (value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: briefing.price.currency ?? "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function attentionLabel(value: BriefingListItem["attention"], locale: Locale) {
  const labels = {
    low: { ko: "낮음", en: "Low" },
    medium: { ko: "주목", en: "Watch" },
    high: { ko: "높음", en: "High" },
  } as const;
  return labels[value][locale];
}

function agentLabel(
  agent: BriefingEditionPayload["agentViews"][number]["agent"],
  locale: Locale,
) {
  const labels = {
    market: { ko: "시장", en: "Market" },
    company: { ko: "기업", en: "Company" },
    financial: { ko: "재무", en: "Financial" },
    risk: { ko: "리스크", en: "Risk" },
  } as const;
  return labels[agent][locale];
}

export function BriefingRoom({ initialState, locale, initialDetails }: Props) {
  const router = useRouter();
  const copy = text[locale];
  const [state, setState] = useState(initialState);
  const [collapsed, setCollapsed] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState("all");
  const [selected, setSelected] = useState<BriefingEditionPayload>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly TickerResult[]>([]);
  const [busySymbol, setBusySymbol] = useState<string>();
  const [clockNow, setClockNow] = useState<number>();
  const [localTimeZone, setLocalTimeZone] = useState(
    locale === "ko" ? "Asia/Seoul" : "UTC",
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const clearedUnreadRef = useRef(false);

  function openSubscription() {
    window.location.assign(`/?lang=${locale}&billing=plans`);
  }

  useEffect(() => {
    if (adding) searchRef.current?.focus();
  }, [adding]);

  useEffect(() => {
    if (!state.authenticated) return;
    const frame = window.requestAnimationFrame(() => {
      setCollapsed(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [state.authenticated]);

  useEffect(() => {
    setClockNow(Date.now());
    const timer = window.setInterval(() => setClockNow(Date.now()), 1_000);
    if (locale === "en")
      setLocalTimeZone(
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      );
    return () => window.clearInterval(timer);
  }, [locale]);

  useEffect(() => {
    if (clearedUnreadRef.current || !state.authenticated || !state.enabled)
      return;
    clearedUnreadRef.current = true;
    const unread = state.briefings.filter((briefing) => briefing.unread);
    setState((current) => ({
      ...current,
      unreadCount: 0,
      briefings: current.briefings.map((briefing) => ({
        ...briefing,
        unread: false,
      })),
    }));
    window.dispatchEvent(new Event(BRIEFINGS_READ_EVENT));
    void Promise.all(
      unread
        .filter(
          (briefing) => initialDetails?.[briefing.briefingId] === undefined,
        )
        .map((briefing) =>
          fetch(`/api/briefings/${briefing.briefingId}/read`, {
            method: "POST",
            credentials: "same-origin",
          }).catch(() => undefined),
        ),
    );
  }, [initialDetails, state.authenticated, state.briefings, state.enabled]);

  useEffect(() => {
    if (!adding || query.trim().length < 1) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(
        `/api/research/tickers?q=${encodeURIComponent(query.trim())}`,
        {
          cache: "no-store",
          signal: controller.signal,
        },
      )
        .then(async (response) => {
          if (!response.ok) return { tickers: [] };
          return (await response.json()) as {
            readonly tickers?: readonly TickerResult[];
          };
        })
        .then((value) => setResults(value.tickers?.slice(0, 6) ?? []))
        .catch(() => undefined);
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [adding, query]);

  const briefings = useMemo(
    () =>
      selectedSymbol === "all"
        ? state.briefings
        : state.briefings.filter(
            (briefing) => briefing.symbol === selectedSymbol,
          ),
    [selectedSymbol, state.briefings],
  );
  const latestBriefingBySymbol = useMemo(() => {
    const latest = new Map<string, string>();
    for (const briefing of state.briefings) {
      const currentId = latest.get(briefing.symbol);
      const current = state.briefings.find(
        (candidate) => candidate.briefingId === currentId,
      );
      if (
        current === undefined ||
        Date.parse(briefing.generatedAt) > Date.parse(current.generatedAt)
      )
        latest.set(briefing.symbol, briefing.briefingId);
    }
    return latest;
  }, [state.briefings]);
  const briefingCountdown =
    clockNow === undefined
      ? "--:--:--"
      : countdownLabel(Date.parse(state.nextBriefingAt) - clockNow, locale);

  async function refresh() {
    const response = await fetch(`/api/briefings?locale=${locale}`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (response.ok) setState((await response.json()) as BriefingRoomState);
  }

  async function addItem(symbol: string) {
    setBusySymbol(symbol);
    try {
      const response = await fetch("/api/briefings/watchlist", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      if (response.ok) {
        await refresh();
        setAdding(false);
        setQuery("");
      }
    } finally {
      setBusySymbol(undefined);
    }
  }

  async function removeItem(item: BriefingWatchlistItem) {
    setBusySymbol(item.symbol);
    try {
      const response = await fetch(
        `/api/briefings/watchlist/${encodeURIComponent(item.symbol)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      if (response.ok) {
        if (selectedSymbol === item.symbol) setSelectedSymbol("all");
        await refresh();
      }
    } finally {
      setBusySymbol(undefined);
    }
  }

  async function openBriefing(item: BriefingListItem) {
    setSelected(undefined);
    setDetailOpen(true);
    const initialDetail = initialDetails?.[item.briefingId];
    if (initialDetail !== undefined) setSelected(initialDetail);
    else {
      const response = await fetch(`/api/briefings/${item.briefingId}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) return;
      const result = (await response.json()) as {
        readonly briefing?: BriefingEditionPayload;
      };
      setSelected(result.briefing);
    }
    if (item.unread) {
      if (initialDetail === undefined)
        await fetch(`/api/briefings/${item.briefingId}/read`, {
          method: "POST",
          credentials: "same-origin",
        }).catch(() => undefined);
      setState((current) => ({
        ...current,
        unreadCount: Math.max(0, current.unreadCount - 1),
        briefings: current.briefings.map((briefing) =>
          briefing.briefingId === item.briefingId
            ? { ...briefing, unread: false }
            : briefing,
        ),
      }));
    }
  }

  return (
    <div
      className={`briefing-room${state.authenticated ? " is-authenticated" : ""}${collapsed ? " is-sidebar-collapsed" : ""}`}
    >
      {state.authenticated ? (
        <SignedInSidebar
          locale={locale}
          collapsed={collapsed}
          mobileContext={{ eyebrow: copy.eyebrow, title: copy.title }}
          activeItem="briefing-room"
          onCollapsedChange={setCollapsed}
          onLocaleChange={(nextLocale) =>
            router.replace(`/briefing-room?lang=${nextLocale}`)
          }
          onSignedOut={() => window.location.assign(`/?lang=${locale}`)}
          onOpenSubscription={openSubscription}
          subscriptionTier={state.tier === "free" ? "free" : "paid"}
        />
      ) : null}

      <MobileBottomNav activeItem="briefing-room" locale={locale} />

      <main className="briefing-room__main">
        <header className="briefing-room__topbar">
          <div>
            {!state.authenticated ? <Brand locale={locale} /> : null}
            <span>{copy.eyebrow}</span>
            <h1>{copy.title}</h1>
          </div>
          <div className="briefing-room__next">
            <Clock3 size={15} />
            <div>
              <span>{copy.next}</span>
              <strong>{formatDate(state.nextBriefingAt, locale, true)}</strong>
              <small>
                {copy.eastern} · {copy.tradingDays}
              </small>
            </div>
            <div className="briefing-room__countdown">
              <span>{copy.countdown}</span>
              <time>{briefingCountdown}</time>
              <small>
                {copy.localTime}{" "}
                {formatDateInZone(
                  state.nextBriefingAt,
                  locale,
                  localTimeZone,
                  true,
                )}
              </small>
            </div>
          </div>
        </header>

        {!state.authenticated || !state.enabled ? (
          <section className="briefing-room__locked">
            <BellRing size={30} />
            <span>{copy.eyebrow}</span>
            <h2>{copy.lockedTitle}</h2>
            <p>{copy.lockedBody}</p>
            <button type="button" onClick={openSubscription}>
              {copy.plan} <ArrowUpRight size={15} />
            </button>
          </section>
        ) : (
          <div className="briefing-room__workspace">
            <aside className="briefing-watchlist">
              <header>
                <div>
                  <div>
                    <span>{copy.watchlist}</span>
                    <strong>
                      {state.watchlist.length} / {state.watchlistLimit}
                    </strong>
                  </div>
                  <small>
                    {copy.remainingChanges}{" "}
                    {state.watchlistChangesRemaining ?? 10}
                    {copy.times}
                  </small>
                </div>
                <button
                  type="button"
                  onClick={() => setAdding((value) => !value)}
                  disabled={
                    state.watchlist.length >= state.watchlistLimit ||
                    state.watchlistChangesRemaining === 0
                  }
                  aria-label={copy.add}
                >
                  {adding ? <X size={16} /> : <Plus size={16} />}
                </button>
              </header>
              {adding ? (
                <div className="briefing-watchlist__search">
                  <label>
                    <Search size={15} />
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={copy.search}
                    />
                  </label>
                  {results.length > 0 ? (
                    <div>
                      {results.map((result) => (
                        <button
                          key={result.providerCode}
                          type="button"
                          disabled={busySymbol !== undefined}
                          onClick={() => void addItem(result.symbol)}
                        >
                          <CompanyLogo symbol={result.symbol} />
                          <span>
                            <strong>{result.symbol}</strong>
                            <small>{result.company}</small>
                          </span>
                          <Plus size={14} />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <nav>
                <button
                  type="button"
                  className={selectedSymbol === "all" ? "is-active" : undefined}
                  onClick={() => setSelectedSymbol("all")}
                >
                  <Sparkles size={16} />
                  <span>{copy.all}</span>
                  <small>{state.briefings.length}</small>
                </button>
                {state.watchlist.map((item) => (
                  <div key={item.symbol}>
                    <button
                      type="button"
                      className={
                        selectedSymbol === item.symbol ? "is-active" : undefined
                      }
                      onClick={() => setSelectedSymbol(item.symbol)}
                    >
                      <CompanyLogo symbol={item.symbol} />
                      <span>
                        <strong>{item.symbol}</strong>
                        <small>{item.company}</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="briefing-watchlist__remove"
                      onClick={() => void removeItem(item)}
                      disabled={
                        busySymbol === item.symbol ||
                        state.watchlistChangesRemaining === 0
                      }
                      aria-label={`${item.symbol} ${copy.remove}`}
                    >
                      <Minus size={13} />
                    </button>
                  </div>
                ))}
              </nav>
            </aside>

            <section className="briefing-feed">
              {state.watchlist.length === 0 ? (
                <div className="briefing-feed__empty">
                  <Plus size={22} />
                  <h2>{copy.emptyTitle}</h2>
                  <p>{copy.emptyBody}</p>
                  <button type="button" onClick={() => setAdding(true)}>
                    {copy.add}
                  </button>
                </div>
              ) : briefings.length === 0 ? (
                <div className="briefing-feed__empty">
                  <CalendarClock size={24} />
                  <h2>{copy.noEditionTitle}</h2>
                  <p>{copy.noEditionBody}</p>
                </div>
              ) : (
                <div className="briefing-feed__grid">
                  {briefings.map((briefing) => {
                    const isLatest =
                      latestBriefingBySymbol.get(briefing.symbol) ===
                      briefing.briefingId;
                    return (
                      <LatestBriefingCard
                        key={briefing.briefingId}
                        latest={isLatest}
                      >
                        <button
                          type="button"
                          className={`briefing-card${isLatest ? " is-latest" : ""}`}
                          data-attention={briefing.attention}
                          onClick={() => void openBriefing(briefing)}
                        >
                          <header>
                            <CompanyLogo symbol={briefing.symbol} />
                            <span>
                              <span className="briefing-card__identity">
                                <strong>{briefing.symbol}</strong>
                                {isLatest ? <em>{copy.latest}</em> : null}
                              </span>
                              <small>{briefing.company}</small>
                            </span>
                            <div className="briefing-card__earnings">
                              <span>
                                <CalendarDays size={11} /> {copy.earnings}
                                {briefing.unread ? <i /> : null}
                              </span>
                              <strong>
                                {briefing.nextEarnings?.certainty !==
                                "confirmed"
                                  ? copy.earningsPending
                                  : formatDate(
                                      briefing.nextEarnings.scheduledAt,
                                      locale,
                                    )}
                              </strong>
                              {briefing.nextEarnings?.certainty ===
                              "confirmed" ? (
                                <small>{copy.confirmed}</small>
                              ) : null}
                            </div>
                          </header>
                          <div className="briefing-card__quote">
                            <strong>{priceLabel(briefing)}</strong>
                            <span
                              data-direction={
                                (briefing.price.changePercent ?? 0) >= 0
                                  ? "up"
                                  : "down"
                              }
                            >
                              {briefing.price.changePercent === undefined
                                ? "—"
                                : `${briefing.price.changePercent >= 0 ? "+" : ""}${briefing.price.changePercent.toFixed(2)}%`}
                            </span>
                          </div>
                          <h2>{briefing.headline}</h2>
                          <p>{briefing.summary}</p>
                          <footer>
                            <span>
                              <i /> {attentionLabel(briefing.attention, locale)}
                            </span>
                            <time>
                              {formatDate(briefing.generatedAt, locale, true)}
                            </time>
                            <ChevronRight size={15} />
                          </footer>
                        </button>
                      </LatestBriefingCard>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {detailOpen ? (
        <div className="briefing-detail-backdrop">
          <aside className="briefing-detail" aria-modal="true" role="dialog">
            <button
              type="button"
              className="briefing-detail__close"
              onClick={() => setDetailOpen(false)}
              aria-label="Close"
            >
              <X size={18} />
            </button>
            {selected === undefined ? (
              <div className="briefing-detail__loading">
                <DotsRing />
              </div>
            ) : (
              <>
                <header className="briefing-detail__hero">
                  <CompanyLogo symbol={selected.symbol} />
                  <div>
                    <span>{selected.company}</span>
                    <h2>{selected.headline}</h2>
                  </div>
                  <div className="briefing-detail__hero-meta">
                    <time>
                      {formatDate(selected.generatedAt, locale, true)}
                    </time>
                    <span>{copy.earnings}</span>
                    <strong>
                      {confirmedEarningsForPayload(selected) === undefined
                        ? copy.earningsPending
                        : formatDate(
                            confirmedEarningsForPayload(selected)!.scheduledAt,
                            locale,
                          )}
                    </strong>
                  </div>
                </header>
                <p className="briefing-detail__summary">{selected.summary}</p>
                {selected.earnings ? (
                  <section className="briefing-detail__earnings">
                    <header>
                      <h3>{copy.earningsSnapshot}</h3>
                      <div>
                        {selected.earnings.latestReportAt ? (
                          <span>
                            {copy.latestRelease} ·{" "}
                            {formatDate(
                              selected.earnings.latestReportAt,
                              locale,
                            )}
                          </span>
                        ) : null}
                        <strong>
                          {copy.earnings} ·{" "}
                          {confirmedEarningsForPayload(selected) === undefined
                            ? copy.earningsPending
                            : formatDate(
                                confirmedEarningsForPayload(selected)!
                                  .scheduledAt,
                                locale,
                              )}
                        </strong>
                      </div>
                    </header>
                    <div>
                      {selected.earnings.epsActual === undefined ? null : (
                        <article>
                          <span>{copy.latestEps}</span>
                          <strong>
                            {earningsCurrency(
                              selected.earnings.epsActual,
                              selected.earnings,
                            )}
                          </strong>
                          {selected.earnings.epsForecast ===
                          undefined ? null : (
                            <small>
                              {copy.consensus}{" "}
                              {earningsCurrency(
                                selected.earnings.epsForecast,
                                selected.earnings,
                              )}
                            </small>
                          )}
                        </article>
                      )}
                      {selected.earnings.epsSurprisePercent ===
                      undefined ? null : (
                        <article
                          data-direction={
                            selected.earnings.epsSurprisePercent >= 0
                              ? "up"
                              : "down"
                          }
                        >
                          <span>{copy.epsSurprise}</span>
                          <strong>
                            {earningsPercent(
                              selected.earnings.epsSurprisePercent,
                            )}
                          </strong>
                        </article>
                      )}
                      {selected.earnings.revenueActual === undefined ? null : (
                        <article>
                          <span>{copy.latestRevenue}</span>
                          <strong>
                            {earningsCurrency(
                              selected.earnings.revenueActual,
                              selected.earnings,
                              true,
                            )}
                          </strong>
                          {selected.earnings.revenueForecast ===
                          undefined ? null : (
                            <small>
                              {copy.consensus}{" "}
                              {earningsCurrency(
                                selected.earnings.revenueForecast,
                                selected.earnings,
                                true,
                              )}
                            </small>
                          )}
                        </article>
                      )}
                      {selected.earnings.revenueSurprisePercent ===
                      undefined ? null : (
                        <article
                          data-direction={
                            selected.earnings.revenueSurprisePercent >= 0
                              ? "up"
                              : "down"
                          }
                        >
                          <span>{copy.revenueSurprise}</span>
                          <strong>
                            {earningsPercent(
                              selected.earnings.revenueSurprisePercent,
                            )}
                          </strong>
                        </article>
                      )}
                      {selected.earnings.nextEpsForecast ===
                      undefined ? null : (
                        <article data-forward="true">
                          <span>{copy.nextEpsConsensus}</span>
                          <strong>
                            {earningsCurrency(
                              selected.earnings.nextEpsForecast,
                              selected.earnings,
                            )}
                          </strong>
                        </article>
                      )}
                      {selected.earnings.nextRevenueForecast ===
                      undefined ? null : (
                        <article data-forward="true">
                          <span>{copy.nextRevenueConsensus}</span>
                          <strong>
                            {earningsCurrency(
                              selected.earnings.nextRevenueForecast,
                              selected.earnings,
                              true,
                            )}
                          </strong>
                        </article>
                      )}
                    </div>
                  </section>
                ) : null}
                {selected.changedSincePrevious ? (
                  <section className="briefing-detail__since">
                    <span>{copy.since}</span>
                    <p>{selected.changedSincePrevious}</p>
                  </section>
                ) : null}
                <section>
                  <h3>
                    {hasExtendedCoverage(selected)
                      ? copy.extendedChanges
                      : copy.changes}
                  </h3>
                  <div className="briefing-detail__changes">
                    {selected.materialChanges.length === 0 ? (
                      <p className="briefing-detail__no-change">
                        {copy.noChanges}
                      </p>
                    ) : (
                      selected.materialChanges.map((signal, index) => (
                        <article key={signal.id}>
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <div>
                            <h4>{signal.title}</h4>
                            <p>{signal.detail}</p>
                            <strong>{signal.investmentMeaning}</strong>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </section>
                <section>
                  <h3>{copy.agents}</h3>
                  <div className="briefing-detail__agents">
                    {selected.agentViews.map((view) => (
                      <article key={view.agent} data-stance={view.stance}>
                        <header>
                          <Image
                            src={agentPresentation[view.agent].portrait}
                            alt=""
                            width={28}
                            height={28}
                          />
                          <span>
                            <strong>{agentLabel(view.agent, locale)}</strong>
                            <small>
                              {agentPresentation[view.agent].name[locale]}
                            </small>
                          </span>
                        </header>
                        <h4>{view.headline}</h4>
                        <p>{view.detail}</p>
                      </article>
                    ))}
                  </div>
                </section>
                <section>
                  <h3>{copy.scenario}</h3>
                  <div className="briefing-detail__scenarios">
                    <article data-case="bull">
                      <span>{copy.bull}</span>
                      <p>{selected.bullCase}</p>
                    </article>
                    <article data-case="bear">
                      <span>{copy.bear}</span>
                      <p>{selected.bearCase}</p>
                    </article>
                  </div>
                </section>
                <section>
                  <h3>{copy.today}</h3>
                  <ol className="briefing-detail__checks">
                    {selected.todayChecks.map((check, index) => (
                      <li
                        key={
                          typeof check === "string"
                            ? check
                            : `${check.title}:${check.timing}`
                        }
                      >
                        {isDecisionCheck(check) ? (
                          <article>
                            <header>
                              <h4>{check.title}</h4>
                              <time>{check.timing}</time>
                            </header>
                            <dl>
                              <div>
                                <dt>{copy.observe}</dt>
                                <dd>{check.metric}</dd>
                              </div>
                              <div data-outcome="pass">
                                <dt>{copy.pass}</dt>
                                <dd>
                                  <strong>{check.confirmation}</strong>
                                  <span>{check.ifConfirmed}</span>
                                </dd>
                              </div>
                              <div data-outcome="fail">
                                <dt>{copy.fail}</dt>
                                <dd>{check.ifFailed}</dd>
                              </div>
                            </dl>
                          </article>
                        ) : (
                          <span>{check}</span>
                        )}
                        <span className="sr-only">{index + 1}</span>
                      </li>
                    ))}
                  </ol>
                </section>
                {visibleUpcomingEvents(selected).length > 0 ? (
                  <section>
                    <h3>{copy.upcoming}</h3>
                    <div className="briefing-detail__events">
                      {visibleUpcomingEvents(selected).map((event) => (
                        <article key={`${event.name}:${event.scheduledAt}`}>
                          <time>
                            {formatDate(event.scheduledAt, locale, true)}
                          </time>
                          <div>
                            <h4>{event.name}</h4>
                            <p>{event.whyItMatters}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}
              </>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
