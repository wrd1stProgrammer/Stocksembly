"use client";

import {
  ArrowUpRight,
  BellRing,
  CalendarClock,
  ChevronRight,
  Clock3,
  Minus,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BriefingEditionPayload,
  BriefingListItem,
  BriefingRoomState,
  BriefingWatchlistItem,
} from "../../briefing/domain/contracts";
import type { Locale } from "../../lib/i18n";
import { Brand } from "../Brand";
import { CompanyLogo } from "../research/ResearchSidebar";
import { SignedInSidebar } from "../SignedInSidebar";

type Props = {
  readonly initialState: BriefingRoomState;
  readonly locale: Locale;
};

type TickerResult = {
  readonly symbol: string;
  readonly providerCode: string;
  readonly company: string;
  readonly exchange: string;
};

const text = {
  ko: {
    title: "브리핑룸",
    eyebrow: "미국 장 시작 1시간 전",
    watchlist: "관심종목",
    add: "종목 추가",
    search: "티커 또는 기업 검색",
    next: "다음 브리핑",
    eastern: "미 동부시간 기준",
    all: "전체",
    emptyTitle: "첫 브리핑을 준비할 종목을 추가하세요",
    emptyBody:
      "새 브리핑은 최근 24시간의 변화와 앞으로 14일의 중요 일정을 전일 내용과 겹치지 않게 정리합니다.",
    noEditionTitle: "다음 프리마켓 브리핑부터 시작됩니다",
    noEditionBody:
      "관심종목 등록이 끝났습니다. 다음 미국 거래일 장 시작 한 시간 전에 새 브리핑이 도착합니다.",
    lockedTitle: "매일의 변화만 빠르게 확인하세요",
    lockedBody:
      "Pro는 3개, Ultra는 10개 관심종목에 대해 거래일마다 프리마켓 브리핑을 제공합니다.",
    plan: "플랜 확인하기",
    today: "오늘 확인할 것",
    changes: "지난 24시간의 변화",
    noChanges: "전일 브리핑 이후 투자 판단을 바꿀 새 사건은 없습니다.",
    agents: "에이전트 관점",
    scenario: "상·하방 경로",
    bull: "상방 경로",
    bear: "하방 경로",
    upcoming: "예정 이벤트",
    since: "전일 브리핑 이후",
    sources: "근거",
    remove: "관심종목에서 삭제",
  },
  en: {
    title: "Briefing room",
    eyebrow: "One hour before the US open",
    watchlist: "Watchlist",
    add: "Add stock",
    search: "Search ticker or company",
    next: "Next briefing",
    eastern: "America/New_York",
    all: "All",
    emptyTitle: "Add a stock for its first briefing",
    emptyBody:
      "Each edition isolates the latest 24-hour changes and the next 14 days of dated events without repeating yesterday's brief.",
    noEditionTitle: "Briefings begin at the next pre-market run",
    noEditionBody:
      "Your watchlist is ready. A new edition arrives one hour before the next US market open.",
    lockedTitle: "See only what changed before the open",
    lockedBody:
      "Pro includes 3 watchlist names and Ultra includes 10, with a briefing every US trading day.",
    plan: "View plans",
    today: "Checks for today",
    changes: "What changed in 24 hours",
    noChanges:
      "No new event since the prior briefing changes the investment view.",
    agents: "Agent views",
    scenario: "Upside and downside paths",
    bull: "Upside path",
    bear: "Downside path",
    upcoming: "Upcoming events",
    since: "Since the prior briefing",
    sources: "Evidence",
    remove: "Remove from watchlist",
  },
} as const;

function formatDate(value: string, locale: Locale, includeTime = false) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
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

export function BriefingRoom({ initialState, locale }: Props) {
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
  const searchRef = useRef<HTMLInputElement>(null);

  function openSubscription() {
    window.location.assign(`/?lang=${locale}&billing=plans`);
  }

  useEffect(() => {
    if (adding) searchRef.current?.focus();
  }, [adding]);

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
    const response = await fetch(`/api/briefings/${item.briefingId}`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) return;
    const result = (await response.json()) as {
      readonly briefing?: BriefingEditionPayload;
    };
    setSelected(result.briefing);
    if (item.unread) {
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

      <main className="briefing-room__main">
        <header className="briefing-room__topbar">
          <div>
            {!state.authenticated ? <Brand locale={locale} /> : null}
            <span>{copy.eyebrow}</span>
            <h1>{copy.title}</h1>
          </div>
          <div className="briefing-room__next">
            <Clock3 size={15} />
            <span>
              {copy.next}
              <strong>{formatDate(state.nextBriefingAt, locale, true)}</strong>
            </span>
            <small>{copy.eastern}</small>
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
                  <span>{copy.watchlist}</span>
                  <strong>
                    {state.watchlist.length} / {state.watchlistLimit}
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() => setAdding((value) => !value)}
                  disabled={state.watchlist.length >= state.watchlistLimit}
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
                      disabled={busySymbol === item.symbol}
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
                  {briefings.map((briefing) => (
                    <button
                      key={briefing.briefingId}
                      type="button"
                      className="briefing-card"
                      data-attention={briefing.attention}
                      onClick={() => void openBriefing(briefing)}
                    >
                      <header>
                        <CompanyLogo symbol={briefing.symbol} />
                        <span>
                          <strong>{briefing.symbol}</strong>
                          <small>{briefing.company}</small>
                        </span>
                        {briefing.unread ? <i /> : null}
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
                  ))}
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
                <i />
                <i />
                <i />
              </div>
            ) : (
              <>
                <header className="briefing-detail__hero">
                  <CompanyLogo symbol={selected.symbol} />
                  <div>
                    <span>{selected.company}</span>
                    <h2>{selected.headline}</h2>
                  </div>
                  <time>{formatDate(selected.generatedAt, locale, true)}</time>
                </header>
                <p className="briefing-detail__summary">{selected.summary}</p>
                {selected.changedSincePrevious ? (
                  <section className="briefing-detail__since">
                    <span>{copy.since}</span>
                    <p>{selected.changedSincePrevious}</p>
                  </section>
                ) : null}
                <section>
                  <h3>{copy.changes}</h3>
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
                        <span>{agentLabel(view.agent, locale)}</span>
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
                    {selected.todayChecks.map((check) => (
                      <li key={check}>{check}</li>
                    ))}
                  </ol>
                </section>
                {selected.upcomingEvents.length > 0 ? (
                  <section>
                    <h3>{copy.upcoming}</h3>
                    <div className="briefing-detail__events">
                      {selected.upcomingEvents.map((event) => (
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
                {selected.sources.length > 0 ? (
                  <section className="briefing-detail__sources">
                    <h3>{copy.sources}</h3>
                    {selected.sources.map((source) => (
                      <a
                        key={source.url}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span>{source.publisher}</span>
                        <strong>{source.title}</strong>
                        <ArrowUpRight size={14} />
                      </a>
                    ))}
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
