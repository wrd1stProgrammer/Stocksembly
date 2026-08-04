import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { LaunchingResearchRoom } from "../../../src/components/research/LaunchingResearchRoom";
import { ResearchRoom } from "../../../src/components/research/ResearchRoom";
import type { Locale } from "../../../src/lib/i18n";
import { PublicRunDetailSchema } from "../../../src/research/client/schemas";
import { TickerSymbolSchema } from "../../../src/research/domain/ids";
import { researchTargetFromQuery } from "../../../src/research/domain/researchTarget";
import { researchProfileFromQuery } from "../../../src/research/domain/researchProfile";
import { getLiveResearchApi } from "../../../src/research/server/api/liveResearchApi";

type Props = {
  readonly params: Promise<{ readonly symbol: string }>;
  readonly searchParams: Promise<{
    readonly lang?: string;
    readonly launch?: string;
    readonly question?: string;
    readonly run?: string;
    readonly target?: string;
    readonly horizon?: string;
    readonly counter?: string;
    readonly depth?: string;
    readonly purpose?: string;
    readonly peers?: string;
  }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  const ticker = TickerSymbolSchema.safeParse(symbol.toUpperCase());
  return {
    title: ticker.success ? `${ticker.data} research room` : "Research room",
  };
}

export default async function ResearchPage({ params, searchParams }: Props) {
  const [{ symbol }, query] = await Promise.all([params, searchParams]);
  const ticker = TickerSymbolSchema.safeParse(symbol.toUpperCase());
  if (!ticker.success) notFound();
  const locale: Locale = query.lang === "ko" ? "ko" : "en";
  if (query.run === undefined && query.launch !== undefined)
    return (
      <LaunchingResearchRoom
        symbol={ticker.data}
        question={query.question?.slice(0, 100) ?? ""}
        locale={locale}
        idempotencyKey={query.launch}
        researchTarget={researchTargetFromQuery(query.target)}
        researchProfile={researchProfileFromQuery(query)}
      />
    );
  if (query.run === undefined)
    return <ResearchRoom initialLocale={locale} recovery="run-required" />;

  const [incomingHeaders, incomingCookies] = await Promise.all([
    headers(),
    cookies(),
  ]);
  const host = incomingHeaders.get("host");
  if (host === null)
    return <ResearchRoom initialLocale={locale} recovery="run-unavailable" />;
  const response = await (await getLiveResearchApi()).handle(
    new Request(`http://${host}/api/research/runs/${query.run}`, {
      headers: {
        host,
        cookie: incomingCookies.toString(),
        "sec-fetch-site": "same-origin",
      },
    }),
  );
  if (response.status === 401)
    return (
      <ResearchRoom
        initialLocale={locale}
        recovery="reauthentication-required"
      />
    );
  if (!response.ok)
    return <ResearchRoom initialLocale={locale} recovery="run-unavailable" />;

  const parsed = PublicRunDetailSchema.safeParse(await response.json());
  if (!parsed.success)
    return <ResearchRoom initialLocale={locale} recovery="run-unavailable" />;
  if (parsed.data.run.symbol !== ticker.data)
    return (
      <ResearchRoom initialLocale={locale} recovery="run-symbol-mismatch" />
    );
  return <ResearchRoom initialLocale={locale} initialSnapshot={parsed.data} />;
}
