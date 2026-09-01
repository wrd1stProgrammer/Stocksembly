"use client";

import "../../styles/research-room.css";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  type AppLocale,
  copy,
  intlLocale,
  researchLocale,
} from "../../lib/i18n";
import type { ResearchRoomCatalogItem } from "../../research/server/researchRoom/researchRoomCatalog";
import { MembershipAccessModal } from "../billing/MembershipAccessModal";
import { FlippingCard } from "../ui/flipping-card";

const COMPANY_NAME_FALLBACKS: Readonly<Record<string, string>> = {
  AAPL: "Apple Inc.",
  AMZN: "Amazon.com, Inc.",
  MSFT: "Microsoft Corporation",
  MU: "Micron Technology, Inc.",
  NVDA: "NVIDIA Corporation",
  TSLA: "Tesla, Inc.",
};

function CompanyWatermark({ symbol }: { readonly symbol: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="landing-research-flip__logo" aria-hidden="true">
      {failed ? (
        <strong>{symbol.slice(0, 1)}</strong>
      ) : (
        <Image
          src={`https://financialmodelingprep.com/image-stock/${encodeURIComponent(symbol)}.png`}
          alt=""
          width={156}
          height={156}
          unoptimized
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

function researchTargetLabel(
  report: ResearchRoomCatalogItem,
  locale: AppLocale,
) {
  const labels = copy[locale].landing.researchRoom;
  if (report.researchTarget.kind === "committee") {
    return labels.fullCommittee;
  }
  return labels.teams[report.researchTarget.departmentId];
}

function publishedTimeLabel(value: string, locale: AppLocale, now: number) {
  const publishedAt = new Date(value);
  const elapsedMinutes = Math.max(
    0,
    Math.floor((now - publishedAt.getTime()) / 60_000),
  );
  if (elapsedMinutes >= 24 * 60) {
    return new Intl.DateTimeFormat(intlLocale(locale), {
      month: "short",
      day: "numeric",
    }).format(publishedAt);
  }
  const timeCopy = copy[locale].landing.publishedTime;
  if (elapsedMinutes < 1) return timeCopy.justNow;
  if (elapsedMinutes < 60) return timeCopy.minutesAgo(elapsedMinutes);
  return timeCopy.hoursMinutesAgo(
    Math.floor(elapsedMinutes / 60),
    elapsedMinutes % 60,
  );
}

function previewReports(
  reports: readonly ResearchRoomCatalogItem[],
): readonly ResearchRoomCatalogItem[] {
  const selected: ResearchRoomCatalogItem[] = [];
  const symbols = new Set<string>();
  for (const report of reports) {
    if (symbols.has(report.symbol)) continue;
    selected.push(report);
    symbols.add(report.symbol);
    if (selected.length === 5) break;
  }
  for (const report of reports) {
    if (selected.length === 5) break;
    if (selected.some((item) => item.reportId === report.reportId)) continue;
    selected.push(report);
  }
  const firstOpen = reports.find((report) => !report.locked);
  if (
    firstOpen !== undefined &&
    selected.every((report) => report.locked) &&
    !selected.some((report) => report.reportId === firstOpen.reportId)
  ) {
    selected.splice(Math.min(4, selected.length), 1, firstOpen);
  }
  return selected.slice(0, 5);
}

export function LandingResearchRoomPreview({
  locale,
  onOpenPlans,
}: {
  readonly locale: AppLocale;
  readonly onOpenPlans?: () => void;
}) {
  const router = useRouter();
  const [reports, setReports] = useState<readonly ResearchRoomCatalogItem[]>(
    [],
  );
  const [companyNames, setCompanyNames] = useState<
    Readonly<Record<string, string>>
  >(COMPANY_NAME_FALLBACKS);
  const [now, setNow] = useState(() => Date.now());
  const [membershipGateOpen, setMembershipGateOpen] = useState(false);
  const labels = copy[locale].landing.researchRoom;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch(
      `/api/research-room?limit=5&sort=latest&lang=${encodeURIComponent(locale)}`,
      {
        credentials: "same-origin",
        cache: "no-store",
      },
    )
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as {
              reports?: readonly ResearchRoomCatalogItem[];
            })
          : undefined,
      )
      .then(async (value) => {
        if (active) {
          const all = value?.reports ?? [];
          const selected = previewReports(all);
          setReports(selected);
          const metadata = await Promise.all(
            [...new Set(selected.map((report) => report.symbol))].map(
              async (symbol) => {
                try {
                  const response = await fetch(
                    `/api/research/tickers?q=${encodeURIComponent(symbol)}`,
                    { credentials: "same-origin" },
                  );
                  if (!response.ok) return undefined;
                  const payload = (await response.json()) as {
                    readonly tickers?: readonly {
                      readonly symbol: string;
                      readonly company: string;
                    }[];
                  };
                  const match = payload.tickers?.find(
                    (ticker) => ticker.symbol === symbol,
                  );
                  return match === undefined
                    ? undefined
                    : ([symbol, match.company] as const);
                } catch {
                  return undefined;
                }
              },
            ),
          );
          if (active) {
            setCompanyNames((current) => ({
              ...current,
              ...Object.fromEntries(
                metadata.filter((item) => item !== undefined),
              ),
            }));
          }
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [locale]);

  if (reports.length === 0) return null;
  return (
    <>
      <section
        className="landing-research-room"
        id="research-room-preview"
        aria-labelledby="landing-research-room-title"
      >
        <header>
          <div>
            <span>{labels.eyebrow}</span>
            <h2 id="landing-research-room-title">{labels.title}</h2>
            <p>{labels.description}</p>
          </div>
          <Link href={`/research-room?lang=${locale}`}>
            {labels.browse}
            <ArrowUpRight size={17} />
          </Link>
        </header>
        <ol className="landing-research-room__deck">
          {reports.map((report, index) => (
            <li key={report.reportId} className="landing-research-room__card">
              <FlippingCard
                width={194}
                height={240}
                className="landing-research-flip__surface"
                ariaLabel={labels.flipLabel(report.symbol, report.question)}
                onActivate={() => {
                  if (report.locked) {
                    setMembershipGateOpen(true);
                    return;
                  }
                  router.push(
                    `/research-room/${report.reportId}?lang=${locale}`,
                  );
                }}
                frontContent={
                  <div className="landing-research-flip__front">
                    <CompanyWatermark symbol={report.symbol} />
                    <div className="landing-research-flip__meta">
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <span>{researchTargetLabel(report, locale)}</span>
                    </div>
                    <div className="landing-research-flip__ticker">
                      <small>
                        {companyNames[report.symbol] ?? report.symbol}
                      </small>
                      <strong>{report.symbol}</strong>
                    </div>
                    <div className="landing-research-flip__foot">
                      <time dateTime={report.publishedAt}>
                        {publishedTimeLabel(report.publishedAt, locale, now)}
                      </time>
                      <span>{labels.flip}</span>
                    </div>
                  </div>
                }
                backContent={
                  <div className="landing-research-flip__back">
                    <div className="landing-research-flip__meta">
                      <span>{report.symbol}</span>
                      <span>{researchTargetLabel(report, locale)}</span>
                    </div>
                    <span className="landing-research-flip__question-label">
                      {labels.questionLabel}
                    </span>
                    <h3>{report.question}</h3>
                    <div className="landing-research-flip__action">
                      {report.locked ? (
                        <>
                          <LockKeyhole size={14} />
                          <span>{labels.locked}</span>
                        </>
                      ) : (
                        <>
                          <span>{labels.open}</span>
                          <ArrowUpRight size={15} />
                        </>
                      )}
                    </div>
                  </div>
                }
              />
            </li>
          ))}
        </ol>
      </section>
      <MembershipAccessModal
        locale={researchLocale(locale)}
        open={membershipGateOpen}
        reason="recent-report"
        onClose={() => setMembershipGateOpen(false)}
        onOpenPlans={onOpenPlans}
      />
    </>
  );
}
