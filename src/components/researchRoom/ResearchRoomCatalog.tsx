"use client";

import {
  ArrowUpRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Landmark,
  LayoutGrid,
  LibraryBig,
  LockKeyhole,
  Plus,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { copy, type Locale } from "../../lib/i18n";
import { RESEARCH_DEPARTMENT_COPY } from "../../research/domain/researchTarget";
import type {
  ResearchRoomAccess,
  ResearchRoomCatalogItem,
  ResearchRoomCompanyFacet,
  ResearchRoomScope,
  ResearchRoomSort,
} from "../../research/server/researchRoom/researchRoomCatalog";
import { Brand } from "../Brand";
import { CompanyLogo } from "../research/ResearchSidebar";
import { SignedInSidebar } from "../SignedInSidebar";

type Props = {
  readonly access: ResearchRoomAccess;
  readonly initialCompanies: readonly ResearchRoomCompanyFacet[];
  readonly initialReports: readonly ResearchRoomCatalogItem[];
  readonly initialTotal: number;
  readonly locale: Locale;
};

const PAGE_SIZE = 32;
type Scope = ResearchRoomScope;
type Sort = ResearchRoomSort;

const scopeOptions: readonly Scope[] = [
  "all",
  "committee",
  "market",
  "company",
  "financial",
  "risk",
];

function scopeLabel(value: Scope, locale: Locale): string {
  const labels = {
    all: { en: "All", ko: "전체" },
    committee: { en: "All agents", ko: "전체 에이전트" },
    market: { en: "Market agent", ko: "시장 에이전트" },
    company: { en: "Company agent", ko: "기업 에이전트" },
    financial: { en: "Financial agent", ko: "재무 에이전트" },
    risk: { en: "Risk agent", ko: "리스크 에이전트" },
  } as const;
  return labels[value][locale];
}

function teamLabel(item: ResearchRoomCatalogItem, locale: Locale) {
  if (item.researchTarget.kind === "committee")
    return locale === "ko" ? "전체 위원회" : "Full committee";
  const content = RESEARCH_DEPARTMENT_COPY[item.researchTarget.departmentId];
  return locale === "ko" ? content.ko : content.en;
}

function TeamIcon({ item }: { readonly item: ResearchRoomCatalogItem }) {
  if (item.researchTarget.kind === "committee")
    return <UsersRound size={14} aria-hidden="true" />;
  if (item.researchTarget.departmentId === "market")
    return <TrendingUp size={14} aria-hidden="true" />;
  if (item.researchTarget.departmentId === "company")
    return <Building2 size={14} aria-hidden="true" />;
  if (item.researchTarget.departmentId === "financial")
    return <Landmark size={14} aria-hidden="true" />;
  return <ShieldAlert size={14} aria-hidden="true" />;
}

function dateLabel(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1_000;

export function formatResearchRoomPublishedAt(
  value: string,
  locale: Locale,
  now = Date.now(),
): string {
  const publishedAt = new Date(value).getTime();
  const elapsed = now - publishedAt;
  if (
    Number.isFinite(publishedAt) &&
    elapsed >= 0 &&
    elapsed < DAY_IN_MILLISECONDS
  ) {
    const totalMinutes = Math.floor(elapsed / 60_000);
    if (totalMinutes < 1) return copy[locale].landing.publishedTime.justNow;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0
      ? copy[locale].landing.publishedTime.hoursMinutesAgo(hours, minutes)
      : copy[locale].landing.publishedTime.minutesAgo(minutes);
  }
  return dateLabel(value, locale);
}

export function ResearchRoomCatalog({
  access,
  initialCompanies,
  initialReports,
  initialTotal,
  locale,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [company, setCompany] = useState("all");
  const [sort, setSort] = useState<Sort>("latest");
  const [page, setPage] = useState(1);
  const [reports, setReports] =
    useState<readonly ResearchRoomCatalogItem[]>(initialReports);
  const [total, setTotal] = useState(initialTotal);
  const [companies, setCompanies] =
    useState<readonly ResearchRoomCompanyFacet[]>(initialCompanies);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const firstRequest = useRef(true);

  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    updateNow();
    const timer = window.setInterval(updateNow, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!access.authenticated) return;
    const frame = window.requestAnimationFrame(() => {
      setSidebarCollapsed(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [access.authenticated]);

  useEffect(() => {
    if (firstRequest.current) {
      firstRequest.current = false;
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          page: String(page),
          scope,
          sort,
        });
        if (query.trim().length > 0) params.set("q", query.trim());
        if (company !== "all") params.set("company", company);
        setLoading(true);
        void fetch(`/api/research-room?${params.toString()}`, {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        })
          .then(async (response) => {
            if (!response.ok) throw new Error("RESEARCH_ROOM_LOAD_FAILED");
            return (await response.json()) as {
              readonly companies?: readonly ResearchRoomCompanyFacet[];
              readonly reports?: readonly ResearchRoomCatalogItem[];
              readonly total?: number;
            };
          })
          .then((value) => {
            if (controller.signal.aborted) return;
            setReports(value.reports ?? []);
            setTotal(value.total ?? 0);
            if (value.companies !== undefined) setCompanies(value.companies);
          })
          .catch(() => undefined)
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      },
      query.trim().length > 0 ? 220 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [company, page, query, scope, sort]);

  const selectedCompany = company === "all" ? undefined : company;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function resetPage(next: () => void) {
    setPage(1);
    next();
  }

  return (
    <div
      className={`research-room-dashboard${
        access.authenticated ? " is-authenticated" : ""
      }${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}
    >
      {access.authenticated ? (
        <SignedInSidebar
          locale={locale}
          collapsed={sidebarCollapsed}
          activeItem="research-room"
          onCollapsedChange={setSidebarCollapsed}
          onLocaleChange={(nextLocale) =>
            router.replace(`/research-room?lang=${nextLocale}`)
          }
          onSignedOut={() => window.location.assign(`/?lang=${locale}`)}
        />
      ) : null}

      <div className="research-room-dashboard__content">
        <header className="research-room-dashboard__topbar">
          <div className="research-room-dashboard__title">
            {access.authenticated ? null : <Brand locale={locale} />}
            <div className="research-room-dashboard__heading">
              <LibraryBig size={19} aria-hidden="true" />
              <div>
                <span className="research-room-dashboard__eyebrow">
                  {locale === "ko" ? "리서치 아카이브" : "Editorial archive"}
                </span>
                <h1>{locale === "ko" ? "리서치룸" : "Research room"}</h1>
              </div>
            </div>
          </div>
          <div className="research-room-dashboard__actions">
            <Link href={`/?lang=${locale}#product`}>
              <Plus size={16} aria-hidden="true" />
              {locale === "ko" ? "새 리서치" : "New research"}
            </Link>
          </div>
        </header>

        <main className="research-room-catalog">
          <aside className="research-room-company-index">
            <header>
              <Building2 size={16} aria-hidden="true" />
              <strong>{locale === "ko" ? "기업" : "Companies"}</strong>
              <span>{companies.length}</span>
            </header>
            <nav aria-label={locale === "ko" ? "기업 필터" : "Company filter"}>
              <button
                type="button"
                className={company === "all" ? "is-active" : undefined}
                onClick={() => resetPage(() => setCompany("all"))}
              >
                <LayoutGrid size={17} aria-hidden="true" />
                <span>
                  <strong>
                    {locale === "ko" ? "전체 기업" : "All companies"}
                  </strong>
                  <small>
                    {total} {locale === "ko" ? "개" : "reports"}
                  </small>
                </span>
              </button>
              {companies.map((item) => (
                <button
                  type="button"
                  key={item.symbol}
                  className={company === item.symbol ? "is-active" : undefined}
                  onClick={() => resetPage(() => setCompany(item.symbol))}
                >
                  <CompanyLogo symbol={item.symbol} />
                  <span>
                    <strong>{item.symbol}</strong>
                    <small>
                      {item.count} {locale === "ko" ? "개" : "reports"}
                    </small>
                  </span>
                </button>
              ))}
            </nav>
          </aside>

          <section className="research-room-catalog__workspace">
            <search
              className="research-room-catalog__controls"
              aria-label={locale === "ko" ? "리서치 검색" : "Research filters"}
            >
              <label>
                <Search size={17} aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => {
                    setPage(1);
                    setQuery(event.target.value);
                  }}
                  placeholder={
                    locale === "ko"
                      ? "티커 또는 투자 질문 검색"
                      : "Search ticker or investment question"
                  }
                />
              </label>
              <div className="research-room-catalog__agent-filter">
                <SlidersHorizontal size={15} aria-hidden="true" />
                <label>
                  <span className="sr-only">
                    {locale === "ko" ? "에이전트 필터" : "Agent filter"}
                  </span>
                  <select
                    value={scope}
                    onChange={(event) =>
                      resetPage(() => setScope(event.target.value as Scope))
                    }
                  >
                    {scopeOptions.map((value) => (
                      <option value={value} key={value}>
                        {scopeLabel(value, locale)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </search>

            <header className="research-room-catalog__result-bar">
              <div>
                {selectedCompany === undefined ? (
                  <LayoutGrid size={17} aria-hidden="true" />
                ) : (
                  <CompanyLogo symbol={selectedCompany} />
                )}
                <strong>
                  {selectedCompany ??
                    (locale === "ko" ? "전체 리서치" : "All research")}
                </strong>
              </div>
              <div className="research-room-catalog__result-actions">
                <span>
                  {total} {locale === "ko" ? "개 리포트" : "reports"}
                </span>
                <label className="research-room-catalog__sort">
                  <span className="sr-only">
                    {locale === "ko" ? "정렬" : "Sort"}
                  </span>
                  <select
                    value={sort}
                    onChange={(event) =>
                      resetPage(() => setSort(event.target.value as Sort))
                    }
                  >
                    <option value="latest">
                      {locale === "ko" ? "최신순" : "Latest"}
                    </option>
                    <option value="popular">
                      {locale === "ko" ? "인기순" : "Popular"}
                    </option>
                  </select>
                </label>
              </div>
            </header>

            <section
              className="research-room-catalog__grid"
              aria-busy={loading}
              aria-live="polite"
            >
              {reports.map((report) => {
                const card = (
                  <article
                    key={report.reportId}
                    data-locked={report.locked ? "true" : "false"}
                  >
                    <header>
                      <div>
                        <CompanyLogo symbol={report.symbol} />
                        <span>
                          <strong>{report.symbol}</strong>
                          <small>
                            <TeamIcon item={report} />
                            {teamLabel(report, locale)}
                          </small>
                        </span>
                      </div>
                      {report.locked ? (
                        <LockKeyhole size={16} aria-hidden="true" />
                      ) : (
                        <ArrowUpRight size={17} aria-hidden="true" />
                      )}
                    </header>
                    <h2>
                      {report.question ||
                        (locale === "ko"
                          ? `${report.symbol} 핵심 투자 논지 검증`
                          : `${report.symbol} investment thesis review`)}
                    </h2>
                    <footer>
                      <time dateTime={report.publishedAt}>
                        <Clock3 size={14} aria-hidden="true" />
                        {now === null
                          ? dateLabel(report.publishedAt, locale)
                          : formatResearchRoomPublishedAt(
                              report.publishedAt,
                              locale,
                              now,
                            )}
                      </time>
                      {report.locked ? (
                        <span className="research-room-catalog__locked">
                          {locale === "ko"
                            ? "7일 후 공개"
                            : "Opens after 7 days"}
                        </span>
                      ) : (
                        <span className="research-room-catalog__open">
                          {locale === "ko" ? "열기" : "Open"}
                          <ArrowUpRight size={14} aria-hidden="true" />
                        </span>
                      )}
                    </footer>
                  </article>
                );
                return report.locked ? (
                  <div
                    className="research-room-catalog__card"
                    key={report.reportId}
                  >
                    {card}
                  </div>
                ) : (
                  <Link
                    className="research-room-catalog__card"
                    key={report.reportId}
                    href={`/research-room/${report.reportId}?lang=${locale}`}
                    aria-label={`${report.symbol} ${report.question}`}
                  >
                    {card}
                  </Link>
                );
              })}
              {reports.length === 0 ? (
                <p className="research-room-catalog__empty">
                  <FileText size={22} aria-hidden="true" />
                  {locale === "ko"
                    ? "조건에 맞는 리서치가 없습니다."
                    : "No research matches these filters."}
                </p>
              ) : null}
            </section>
            {totalPages > 1 ? (
              <nav
                className="research-room-catalog__pagination"
                aria-label={locale === "ko" ? "페이지 이동" : "Pagination"}
              >
                <button
                  type="button"
                  disabled={page === 1 || loading}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  aria-label={locale === "ko" ? "이전 페이지" : "Previous page"}
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>
                <span>
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages || loading}
                  onClick={() =>
                    setPage((value) => Math.min(totalPages, value + 1))
                  }
                  aria-label={locale === "ko" ? "다음 페이지" : "Next page"}
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </nav>
            ) : null}
          </section>
        </main>
      </div>
    </div>
  );
}
