import { localizeBriefingLimitation } from "../domain/briefingLimitations";
import type {
  BriefingEditionPayload,
  BriefingSignal,
  BriefingSourceSnapshot,
} from "../domain/contracts";
import { companySpecificAgentViews } from "./briefingAgentViewPolicy";
import {
  fallbackDecisionCases,
  sourceBackedDecisionChecks,
} from "./briefingDecisionPolicy";
import {
  briefingAttention,
  isEarningsEventName,
  publicUpcomingEvents,
} from "./briefingSignalPolicy";
import type { BriefingDraft } from "./briefingSynthesisSchema";

type AssemblyInput = {
  readonly locale: BriefingEditionPayload["locale"];
  readonly snapshot: BriefingSourceSnapshot;
  readonly previous?: BriefingEditionPayload;
  readonly generatedAt: string;
  readonly signals: readonly BriefingSignal[];
  readonly draft: BriefingDraft;
  readonly fallback: BriefingDraft;
  readonly modelFailed: boolean;
};

export function assembleBriefingEdition(
  input: AssemblyInput,
): BriefingEditionPayload {
  const byId = new Map(input.signals.map((signal) => [signal.id, signal]));
  const materialChanges = input.draft.materialChanges.flatMap((localized) => {
    const source = byId.get(localized.id);
    return source === undefined || source.kind === "price"
      ? []
      : [
          {
            ...source,
            title: localized.title,
            detail: localized.detail,
            investmentMeaning: localized.investmentMeaning,
          },
        ];
  });
  const materialSourceUrls = new Set(
    materialChanges.flatMap((signal) =>
      signal.sourceUrl === undefined ? [] : [signal.sourceUrl],
    ),
  );
  const citedSources = input.snapshot.sources.filter((source) =>
    materialSourceUrls.has(source.url),
  );
  const upcomingEvents = publicUpcomingEvents(input.snapshot)
    .slice(0, 3)
    .map((source) => {
      const localized = input.draft.upcomingEvents.find(
        (event) => event.scheduledAt === source.scheduledAt,
      );
      const fallbackLocalized = input.fallback.upcomingEvents.find(
        (event) => event.scheduledAt === source.scheduledAt,
      );
      const earningsEvent = isEarningsEventName(source.name);
      const koreanEarnings = input.locale === "ko" && earningsEvent;
      return Object.freeze({
        ...source,
        ...(localized === undefined && fallbackLocalized === undefined
          ? {}
          : {
              name: koreanEarnings
                ? `${input.snapshot.symbol} 실적 발표`
                : (localized?.name ?? fallbackLocalized?.name ?? source.name),
              whyItMatters:
                earningsEvent && fallbackLocalized !== undefined
                  ? fallbackLocalized.whyItMatters
                  : (localized?.whyItMatters ??
                    fallbackLocalized?.whyItMatters ??
                    source.whyItMatters),
            }),
        certainty: source.certainty ?? "estimated",
      });
    });
  const todayChecks = sourceBackedDecisionChecks({
    snapshot: input.snapshot,
    events: upcomingEvents,
    model: input.draft.todayChecks,
    fallback: input.fallback.todayChecks,
  });
  const cases = fallbackDecisionCases(input.locale, input.snapshot);
  const evidenceCompleteness =
    input.snapshot.limitations.length === 0 ? "complete" : "partial";
  const changedSincePrevious =
    input.previous === undefined || materialChanges.length === 0
      ? undefined
      : input.locale === "ko"
        ? `직전 브리핑 이후 확인된 출처 기반 변화 ${materialChanges.length}건을 반영했습니다.`
        : `${materialChanges.length} new source-backed change${materialChanges.length === 1 ? "" : "s"} versus the prior briefing.`;
  return Object.freeze({
    schemaVersion: 1,
    symbol: input.snapshot.symbol,
    company: input.snapshot.company,
    locale: input.locale,
    marketDate: input.snapshot.marketDate,
    generatedAt: input.generatedAt,
    cutoffAt: input.snapshot.cutoffAt,
    coverageStart: input.snapshot.coverageStart,
    status: evidenceCompleteness === "complete" ? "ready" : "partial",
    evidenceCompleteness,
    generationMode: input.modelFailed ? "fallback" : "model",
    attention: briefingAttention(input.snapshot, input.signals),
    headline: input.draft.headline,
    summary: input.draft.summary,
    price: input.snapshot.quote,
    ...(input.snapshot.earnings === undefined
      ? {}
      : { earnings: input.snapshot.earnings }),
    materialChanges: Object.freeze(materialChanges),
    agentViews: Object.freeze(
      companySpecificAgentViews({
        locale: input.locale,
        snapshot: input.snapshot,
        model: input.draft.agentViews,
        fallback: input.fallback.agentViews,
      }),
    ),
    bullCase: cases.bullCase,
    bearCase: cases.bearCase,
    upcomingEvents: Object.freeze(upcomingEvents),
    todayChecks: Object.freeze(todayChecks),
    ...(changedSincePrevious === undefined ? {} : { changedSincePrevious }),
    ...(input.draft.stillWatching === null
      ? {}
      : { stillWatching: input.draft.stillWatching }),
    sources: Object.freeze(citedSources),
    limitations: Object.freeze(
      input.snapshot.limitations.map((limitation) =>
        localizeBriefingLimitation(limitation, input.locale),
      ),
    ),
  });
}
