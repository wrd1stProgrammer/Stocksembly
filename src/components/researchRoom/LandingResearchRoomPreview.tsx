"use client";

import { ArrowUpRight, LockKeyhole } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { copy, type Locale } from "../../lib/i18n";
import type { ResearchRoomCatalogItem } from "../../research/server/researchRoom/researchRoomCatalog";
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

function researchTargetLabel(report: ResearchRoomCatalogItem, locale: Locale) {
  if (report.researchTarget.kind === "committee") {
    return locale === "ko" ? "전체 위원회" : "Full committee";
  }
  const labels = {
    market: locale === "ko" ? "시장팀" : "Market team",
    company: locale === "ko" ? "기업팀" : "Company team",
    financial: locale === "ko" ? "재무팀" : "Financial team",
    risk: locale === "ko" ? "리스크팀" : "Risk team",
  } as const;
  return labels[report.researchTarget.departmentId];
}

function publishedTimeLabel(value: string, locale: Locale, now: number) {
  const publishedAt = new Date(value);
  const elapsedMinutes = Math.max(
    0,
    Math.floor((now - publishedAt.getTime()) / 60_000),
  );
  if (elapsedMinutes >= 24 * 60) {
    return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
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
}: {
  readonly locale: Locale;
}) {
  const router = useRouter();
  const [reports, setReports] = useState<readonly ResearchRoomCatalogItem[]>(
    [],
  );
  const [companyNames, setCompanyNames] = useState<
    Readonly<Record<string, string>>
  >(COMPANY_NAME_FALLBACKS);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/research-room?limit=5&sort=latest", {
      credentials: "same-origin",
      cache: "no-store",
    })
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
  }, []);

  if (reports.length === 0) return null;
  return (
    <section
      className="landing-research-room"
      id="research-room-preview"
      aria-labelledby="landing-research-room-title"
    >
      <header>
        <div>
          <span>
            {locale === "ko"
              ? "RESEARCH ROOM · 최근 5개"
              : "RESEARCH ROOM · LATEST FIVE"}
          </span>
          <h2 id="landing-research-room-title">
            {locale === "ko"
              ? "다른 투자자의 질문을 뒤집어 보세요."
              : "Flip through questions investors already asked."}
          </h2>
          <p>
            {locale === "ko"
              ? "카드 뒷면에서 질문을 확인하고, 완성된 리서치로 바로 이동합니다."
              : "Reveal the question on the back, then open the finished research."}
          </p>
        </div>
        <Link href={`/research-room?lang=${locale}`}>
          {locale === "ko" ? "모든 리서치 보기" : "Browse all research"}
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
              ariaLabel={
                locale === "ko"
                  ? `${report.symbol} 리서치 카드 뒤집기: ${report.question}`
                  : `Flip ${report.symbol} research card: ${report.question}`
              }
              onActivate={
                report.locked
                  ? undefined
                  : () =>
                      router.push(
                        `/research-room/${report.reportId}?lang=${locale}`,
                      )
              }
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
                    <span>{locale === "ko" ? "뒤집기 ↗" : "Flip ↗"}</span>
                  </div>
                </div>
              }
              backContent={
                <div className="landing-research-flip__back">
                  <div className="landing-research-flip__meta">
                    <span>{report.symbol}</span>
                    <span>{researchTargetLabel(report, locale)}</span>
                  </div>
                  <h3>{report.question}</h3>
                  <div className="landing-research-flip__action">
                    {report.locked ? (
                      <>
                        <LockKeyhole size={14} />
                        <span>
                          {locale === "ko" ? "7일 후 공개" : "Opens in 7 days"}
                        </span>
                      </>
                    ) : (
                      <>
                        <span>
                          {locale === "ko" ? "리서치 열기" : "Open research"}
                        </span>
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
  );
}
