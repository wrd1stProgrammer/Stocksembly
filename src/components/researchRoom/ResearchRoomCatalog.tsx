"use client";

import "../../styles/research-room.css";
import { BorderBeam } from "border-beam";
import {
  ArrowUpRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Landmark,
  Languages,
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
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  type AppLocale,
  copy as appCopy,
  intlLocale,
  researchLocale,
} from "../../lib/i18n";
import type {
  ResearchRoomAccess,
  ResearchRoomCatalogItem,
  ResearchRoomCompanyFacet,
  ResearchRoomScope,
  ResearchRoomSort,
} from "../../research/server/researchRoom/researchRoomCatalog";
import { HeaderAuthAction } from "../auth/HeaderAuthAction";
import { Brand } from "../Brand";
import { MembershipAccessModal } from "../billing/MembershipAccessModal";
import { SidebarSubscriptionModal } from "../billing/SidebarSubscriptionModal";
import { MobileBottomNav } from "../MobileBottomNav";
import { CompanyLogo } from "../research/ResearchSidebar";
import { SignedInSidebar } from "../SignedInSidebar";
import { researchRoomUiCopy } from "./researchRoomCopy";
import { researchRoomPageHref } from "./researchRoomUrls";

type Props = {
  readonly access: ResearchRoomAccess;
  readonly initialCompanies: readonly ResearchRoomCompanyFacet[];
  readonly initialPage: number;
  readonly initialReports: readonly ResearchRoomCatalogItem[];
  readonly initialTotal: number;
  readonly locale: AppLocale;
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

function ResearchRoomCardFrame({ children }: { readonly children: ReactNode }) {
  const [active, setActive] = useState(false);
  return (
    <BorderBeam
      className="research-room-catalog__beam"
      size="pulse-outside"
      colorVariant="mono"
      active={active}
      strength={0.82}
      borderRadius={12}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      onPointerDown={() => setActive(true)}
    >
      {children}
    </BorderBeam>
  );
}

function scopeLabel(value: Scope, locale: AppLocale): string {
  return researchRoomUiCopy[locale].scopes[value];
}

function teamLabel(item: ResearchRoomCatalogItem, locale: AppLocale) {
  if (item.researchTarget.kind === "committee")
    return researchRoomUiCopy[locale].teams.committee;
  return researchRoomUiCopy[locale].teams[item.researchTarget.departmentId];
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

function dateLabel(value: string, locale: AppLocale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1_000;

export function formatResearchRoomPublishedAt(
  value: string,
  locale: AppLocale,
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
    if (totalMinutes < 1) return appCopy[locale].landing.publishedTime.justNow;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0
      ? appCopy[locale].landing.publishedTime.hoursMinutesAgo(hours, minutes)
      : appCopy[locale].landing.publishedTime.minutesAgo(minutes);
  }
  return dateLabel(value, locale);
}

export function ResearchRoomCatalog({
  access,
  initialCompanies,
  initialPage,
  initialReports,
  initialTotal,
  locale,
}: Props) {
  const roomCopy = researchRoomUiCopy[locale];
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [company, setCompany] = useState("all");
  const [sort, setSort] = useState<Sort>("latest");
  const [page, setPage] = useState(initialPage);
  const [reports, setReports] =
    useState<readonly ResearchRoomCatalogItem[]>(initialReports);
  const [total, setTotal] = useState(initialTotal);
  const [companies, setCompanies] =
    useState<readonly ResearchRoomCompanyFacet[]>(initialCompanies);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [membershipGateOpen, setMembershipGateOpen] = useState(false);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [languageNotice, setLanguageNotice] =
    useState<ResearchRoomCatalogItem | null>(null);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

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
    // The server already rendered the first page with default filters, so
    // reuse it instead of fetching the same list again on mount (or when the
    // filters return to their defaults).
    const defaultQuery =
      page === initialPage &&
      scope === "all" &&
      company === "all" &&
      sort === "latest" &&
      query.trim().length === 0;
    if (defaultQuery) {
      setReports(initialReports);
      setTotal(initialTotal);
      setCompanies(initialCompanies);
      setLoading(false);
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
          lang: locale,
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
  }, [
    company,
    locale,
    page,
    query,
    scope,
    sort,
    initialCompanies,
    initialPage,
    initialReports,
    initialTotal,
  ]);

  const selectedCompany = company === "all" ? undefined : company;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const usesDefaultArchiveView =
    query.trim().length === 0 &&
    scope === "all" &&
    company === "all" &&
    sort === "latest";

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
          onOpenSubscription={() => setSubscriptionOpen(true)}
          subscriptionTier={access.tier}
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
                  {roomCopy.eyebrow}
                </span>
                <h1>{roomCopy.title}</h1>
              </div>
            </div>
          </div>
          <div className="research-room-dashboard__actions">
            {access.authenticated ? null : (
              <HeaderAuthAction
                label={appCopy[locale].nav.getStarted}
                locale={locale}
              />
            )}
            <Link href={`/?lang=${locale}#product`}>
              <Plus size={16} aria-hidden="true" />
              {roomCopy.newResearch}
            </Link>
          </div>
        </header>

        <main className="research-room-catalog">
          <aside className="research-room-company-index">
            <header>
              <Building2 size={16} aria-hidden="true" />
              <strong>{roomCopy.companies}</strong>
              <span>{companies.length}</span>
            </header>
            <nav aria-label={roomCopy.companyFilter}>
              <button
                type="button"
                className={company === "all" ? "is-active" : undefined}
                onClick={() => resetPage(() => setCompany("all"))}
              >
                <LayoutGrid size={17} aria-hidden="true" />
                <span>
                  <strong>{roomCopy.allCompanies}</strong>
                  <small>
                    {total} {roomCopy.reports}
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
                      {item.count} {roomCopy.reports}
                    </small>
                  </span>
                </button>
              ))}
            </nav>
          </aside>

          <section className="research-room-catalog__workspace">
            <search
              className="research-room-catalog__controls"
              aria-label={roomCopy.researchFilters}
            >
              <label>
                <Search size={17} aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => {
                    setPage(1);
                    setQuery(event.target.value);
                  }}
                  placeholder={roomCopy.searchPlaceholder}
                />
              </label>
              <div className="research-room-catalog__agent-filter">
                <SlidersHorizontal size={15} aria-hidden="true" />
                <label>
                  <span className="sr-only">{roomCopy.agentFilter}</span>
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
                <strong>{selectedCompany ?? roomCopy.allResearch}</strong>
              </div>
              <div className="research-room-catalog__result-actions">
                <span>
                  {total} {roomCopy.reports}
                </span>
                <label className="research-room-catalog__sort">
                  <span className="sr-only">{roomCopy.sort}</span>
                  <select
                    value={sort}
                    onChange={(event) =>
                      resetPage(() => setSort(event.target.value as Sort))
                    }
                  >
                    <option value="latest">{roomCopy.latest}</option>
                    <option value="popular">{roomCopy.popular}</option>
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
                    <h2>{roomCopy.fileTitle(teamLabel(report, locale))}</h2>
                    <p className="research-room-catalog__question">
                      <span>{roomCopy.questionLabel}</span>
                      <span>
                        {report.question ||
                          roomCopy.thesisFallback(report.symbol)}
                      </span>
                    </p>
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
                          {roomCopy.opensAfterSevenDays}
                        </span>
                      ) : (
                        <span className="research-room-catalog__open">
                          {roomCopy.open}
                          <ArrowUpRight size={14} aria-hidden="true" />
                        </span>
                      )}
                    </footer>
                  </article>
                );
                const differentLanguage = report.locale !== locale;
                return report.locked ? (
                  <ResearchRoomCardFrame key={report.reportId}>
                    <button
                      type="button"
                      className="research-room-catalog__card"
                      aria-label={roomCopy.subscriberAccess(report.symbol)}
                      onClick={() => setMembershipGateOpen(true)}
                    >
                      {card}
                    </button>
                  </ResearchRoomCardFrame>
                ) : differentLanguage ? (
                  <ResearchRoomCardFrame key={report.reportId}>
                    <button
                      type="button"
                      className="research-room-catalog__card"
                      aria-label={`${report.symbol} ${report.question}`}
                      onClick={() => setLanguageNotice(report)}
                    >
                      {card}
                    </button>
                  </ResearchRoomCardFrame>
                ) : (
                  <ResearchRoomCardFrame key={report.reportId}>
                    <Link
                      className="research-room-catalog__card"
                      href={`/research-room/${report.reportId}?lang=${locale}`}
                      aria-label={`${report.symbol} ${report.question}`}
                    >
                      {card}
                    </Link>
                  </ResearchRoomCardFrame>
                );
              })}
              {reports.length === 0 ? (
                <p className="research-room-catalog__empty">
                  <FileText size={22} aria-hidden="true" />
                  {roomCopy.noMatches}
                </p>
              ) : null}
            </section>
            {totalPages > 1 ? (
              <nav
                className="research-room-catalog__pagination"
                aria-label={roomCopy.pagination}
              >
                {usesDefaultArchiveView ? (
                  page === 1 ? (
                    <span
                      className="research-room-catalog__page-link is-disabled"
                      aria-hidden="true"
                    >
                      <ChevronLeft size={16} aria-hidden="true" />
                    </span>
                  ) : (
                    <Link
                      className="research-room-catalog__page-link"
                      href={researchRoomPageHref(page - 1, locale)}
                      aria-label={roomCopy.previousPage}
                    >
                      <ChevronLeft size={16} aria-hidden="true" />
                    </Link>
                  )
                ) : (
                  <button
                    type="button"
                    disabled={page === 1 || loading}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    aria-label={roomCopy.previousPage}
                  >
                    <ChevronLeft size={16} aria-hidden="true" />
                  </button>
                )}
                <span>
                  {page} / {totalPages}
                </span>
                {usesDefaultArchiveView ? (
                  page >= totalPages ? (
                    <span
                      className="research-room-catalog__page-link is-disabled"
                      aria-hidden="true"
                    >
                      <ChevronRight size={16} aria-hidden="true" />
                    </span>
                  ) : (
                    <Link
                      className="research-room-catalog__page-link"
                      href={researchRoomPageHref(page + 1, locale)}
                      aria-label={roomCopy.nextPage}
                    >
                      <ChevronRight size={16} aria-hidden="true" />
                    </Link>
                  )
                ) : (
                  <button
                    type="button"
                    disabled={page >= totalPages || loading}
                    onClick={() =>
                      setPage((value) => Math.min(totalPages, value + 1))
                    }
                    aria-label={roomCopy.nextPage}
                  >
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                )}
              </nav>
            ) : null}
          </section>
        </main>
      </div>
      <MobileBottomNav
        activeItem="research-room"
        locale={locale}
        hidden={access.authenticated && !sidebarCollapsed}
      />
      <MembershipAccessModal
        locale={researchLocale(locale)}
        open={membershipGateOpen}
        reason="recent-report"
        onClose={() => setMembershipGateOpen(false)}
        onOpenPlans={() => setSubscriptionOpen(true)}
      />
      <SidebarSubscriptionModal
        open={subscriptionOpen}
        locale={researchLocale(locale)}
        initialTier={access.authenticated ? access.tier : "free"}
        onClose={() => setSubscriptionOpen(false)}
      />
      {languageNotice === null ? null : (
        <div className="research-room-language-notice" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="research-room-language-notice-title"
          >
            <Languages size={20} aria-hidden="true" />
            <div>
              <h2 id="research-room-language-notice-title">
                {roomCopy.languageNoticeTitle}
              </h2>
              <p>{roomCopy.languageNoticeBody}</p>
            </div>
            <footer>
              <button type="button" onClick={() => setLanguageNotice(null)}>
                {roomCopy.cancel}
              </button>
              <button
                type="button"
                className="is-primary"
                onClick={() =>
                  router.push(
                    `/research-room/${languageNotice.reportId}?lang=${locale}`,
                  )
                }
              >
                {roomCopy.openOriginal}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
