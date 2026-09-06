import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FullReportPreview } from "../../../src/components/research/FullReportPreview";
import { ResearchRoom } from "../../../src/components/research/ResearchRoom";
import type { Locale } from "../../../src/lib/i18n";
import { researchLocaleFromValue } from "../../../src/lib/i18n";
import { findTicker } from "../../../src/lib/tickers";
import { committeeReportPreviewFixture } from "../../../src/research/committeeReportPreviewFixture";
import type { ResearchEventWithModeFor } from "../../../src/research/compositionMode";
import { fixtureComposition } from "../../../src/research/compositions/fixture";
import { officeRepresentativeMeetings } from "../../../src/research/officeRepresentativeMeetings";

type Props = {
  readonly params: Promise<{ readonly symbol: string }>;
  readonly searchParams: Promise<{
    readonly lang?: string;
    readonly view?: string;
    readonly version?: string;
    readonly scene?: string;
  }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (process.env.NODE_ENV === "production") notFound();
  const { symbol } = await params;
  const ticker = findTicker(symbol);
  return { title: ticker ? `${ticker.symbol} research room` : "Research room" };
}

export default async function FixtureResearchPage({
  params,
  searchParams,
}: Props) {
  if (process.env.NODE_ENV === "production") notFound();
  const [{ symbol }, query] = await Promise.all([params, searchParams]);
  const ticker = findTicker(symbol);
  if (!ticker) notFound();
  const locale: Locale = researchLocaleFromValue(query.lang);
  const company = fixtureComposition.createCompany(
    ticker.symbol,
    ticker.company,
    ticker.exchange,
    ticker.sector,
  );
  if (query.version === "v2")
    return (
      <FullReportPreview
        company={company}
        report={committeeReportPreviewFixture()}
        reportId="committee-fixture"
        locale={locale}
      />
    );
  const payload = await fixtureComposition.createPayload();
  const range =
    query.scene === "team"
      ? [240, 359]
      : query.scene === "visit"
        ? [360, 999]
        : query.scene === "forum"
          ? [1080, 1580]
          : undefined;
  const visits = payload.data.playbackEvents.filter((event) =>
    ["handoff-market-company", "handoff-financial-risk"].includes(event.id),
  );
  const continuityEvents: readonly ResearchEventWithModeFor<"fixture">[] = [
    ...visits,
    ...visits.map(
      (event): ResearchEventWithModeFor<"fixture"> => ({
        ...event,
        id: `response-${event.id}`,
        agent: event.participantIds?.[1] ?? event.agent,
        workflowKind: "owner_response_committed",
        summary: {
          ko: "반론의 근거를 확인했습니다. 이 자리에서 조건과 위험을 함께 검토하겠습니다.",
          en: "I have reviewed the counter-evidence. Let us examine the conditions and risks here.",
        },
      }),
    ),
    ...payload.data.playbackEvents
      .filter((event) => event.id === "representatives-gathering")
      .map(
        (event): ResearchEventWithModeFor<"fixture"> => ({
          ...event,
          id: "central-evidence-review",
          agent: "chair",
          phase: "auditing",
          workflowKind: "structural_audit_completed",
          summary: {
            ko: "각 팀의 근거를 중앙 회의에서 함께 검토하겠습니다.",
            en: "We will review each team's evidence together at the central table.",
          },
        }),
      ),
    ...payload.data.playbackEvents.filter((event) =>
      ["committee", "complete"].includes(event.phase),
    ),
  ];
  const previewPayload =
    query.scene === "continuity"
      ? {
          ...payload,
          data: {
            ...payload.data,
            playbackEvents: officeRepresentativeMeetings(
              continuityEvents.map((event) =>
                visits.includes(event)
                  ? { ...event, workflowKind: "challenge_committed" }
                  : event,
              ),
            ).map((event) => ({
              ...event,
              mode: payload.mode,
              origin: payload.origin,
            })),
          },
        }
      : range
        ? {
            ...payload,
            data: {
              ...payload.data,
              playbackEvents: payload.data.playbackEvents.filter(
                (event) =>
                  (event.tick ?? 0) >= (range[0] ?? 0) &&
                  (event.tick ?? 0) <= (range[1] ?? 1580),
              ),
            },
          }
        : payload;
  return (
    <ResearchRoom
      company={company}
      payload={previewPayload}
      initialLocale={locale}
      initialComplete={query.view === "report"}
    />
  );
}
