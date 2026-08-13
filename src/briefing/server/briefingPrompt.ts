import type { Locale } from "../../lib/i18n";
import type {
  BriefingEditionPayload,
  BriefingSignal,
  BriefingSourceSnapshot,
} from "../domain/contracts";
import { publicUpcomingEvents } from "./briefingSignalPolicy";

function roundedRecord(
  values: Readonly<Record<string, number | string | undefined>>,
): Readonly<Record<string, number | string | undefined>> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      typeof value !== "number"
        ? value
        : Math.abs(value) >= 1_000 || key === "averageVolume20d"
          ? Math.round(value)
          : Number(value.toFixed(2)),
    ]),
  );
}

export type BriefingModelInput = {
  readonly locale: Locale;
  readonly snapshot: BriefingSourceSnapshot;
  readonly signals: readonly BriefingSignal[];
  readonly previous: BriefingEditionPayload | undefined;
};

function earningsEvidence(snapshot: BriefingSourceSnapshot) {
  const earnings = snapshot.earnings;
  if (earnings === undefined) return undefined;
  return {
    latestResult: {
      ...(earnings.latestReportAt === undefined
        ? {}
        : { reportAt: earnings.latestReportAt }),
      ...(earnings.epsActual === undefined
        ? {}
        : { epsActual: earnings.epsActual }),
      ...(earnings.epsForecast === undefined
        ? {}
        : { epsForecast: earnings.epsForecast }),
      ...(earnings.epsSurprisePercent === undefined
        ? {}
        : { epsSurprisePercent: earnings.epsSurprisePercent }),
    },
    nextReport: {
      ...(earnings.nextReportAt === undefined
        ? {}
        : { reportAt: earnings.nextReportAt }),
      ...(earnings.nextReportCertainty === undefined
        ? {}
        : { certainty: earnings.nextReportCertainty }),
      ...(earnings.nextEpsForecast === undefined
        ? {}
        : { epsForecast: earnings.nextEpsForecast }),
      ...(earnings.nextRevenueForecast === undefined
        ? {}
        : { revenueForecast: earnings.nextRevenueForecast }),
    },
    comparison: "different_reports_not_comparable",
    oneOffInterpretation:
      snapshot.backgroundFinancialContext?.oneOffInterpretation ??
      "unavailable",
  } as const;
}

export function briefingPrompt(input: BriefingModelInput): string {
  const { locale, previous, signals, snapshot } = input;
  const coverageHours = Math.round(
    (Date.parse(snapshot.cutoffAt) - Date.parse(snapshot.coverageStart)) /
      (60 * 60 * 1_000),
  );
  const { earnings: _earnings, ...snapshotWithoutEarnings } = snapshot;
  const groupedEarnings = earningsEvidence(snapshot);
  const promptSnapshot = {
    ...snapshotWithoutEarnings,
    upcomingEvents: publicUpcomingEvents(snapshot),
    quote: roundedRecord(snapshot.quote),
    ...(snapshot.marketReference === undefined
      ? {}
      : { marketReference: roundedRecord(snapshot.marketReference) }),
    ...(snapshot.technicalReference === undefined
      ? {}
      : {
          technicalReference: roundedRecord({
            timeframe: snapshot.technicalReference.timeframe,
            trend: snapshot.technicalReference.trend,
            support: snapshot.technicalReference.support,
            resistance: snapshot.technicalReference.resistance,
          }),
        }),
    fundamentals: roundedRecord(snapshot.fundamentals),
    fundamentalSeries: Object.fromEntries(
      Object.entries(snapshot.fundamentalSeries ?? {}).map(([key, points]) => [
        key,
        points.map((point) => ({
          observedAt: point.observedAt,
          value:
            Math.abs(point.value) >= 1_000
              ? Math.round(point.value)
              : Number(point.value.toFixed(2)),
        })),
      ]),
    ),
    ...(groupedEarnings === undefined
      ? {}
      : { earningsEvidence: groupedEarnings }),
    ...(snapshot.backgroundFinancialContext === undefined
      ? {}
      : { backgroundFinancialContext: snapshot.backgroundFinancialContext }),
    signals,
  };
  return [
    "You chair a US-equity daily briefing assembled from several analytical lenses. It may be generated pre-market, intraday, or after hours.",
    `Write in ${locale === "ko" ? "natural Korean" : "concise professional English"}. Locale controls language, not investor geography.`,
    "Use only the JSON evidence below. Do not browse or invent facts, dates, prices, estimates, events, or causal links.",
    `The evidence window spans about ${coverageHours} hours. Beyond 36 hours, describe it as since the prior briefing or a weekend/holiday catch-up, never as the last 24 hours.`,
    "Return one to three distinct, evidence-backed agentViews. Choose only useful lenses from market, company, financial, and risk; do not pad the output with ceremonial personas.",
    "Each view must name a supplied event, price level, market reference, fundamental, or confirmed dated event. Keep the lenses semantically non-overlapping.",
    "Return one to three executable todayChecks. Every check requires horizon=today or horizon=next_catalyst and must state a timing that has not already elapsed at cutoffAt, an exact supplied metric or named evidence, a pass condition, and distinct implications for pass, unclear/neutral, and fail outcomes.",
    "For horizon=next_catalyst, copy the matching upcomingEvent scheduledAt market date exactly as YYYY-MM-DD. Do not use prose dates or invent a date that is absent from upcomingEvents.",
    "Earnings evidence is split into latestResult and nextReport groups that are different reports and are not directly comparable. Compare latest EPS actual only with its paired same-report forecast or surprise. Missing one-off interpretation forbids causal, adjusted, normalized, or cross-period EPS comparisons. Never recover an estimated earnings date omitted from upcomingEvents.",
    "Use technicalReference only when it changes a decision rule. Indicators are observations, not forecasts.",
    "materialChanges may use only supplied signal IDs. Omit repeated signals. upcomingEvents must preserve supplied ISO dates and certainty.",
    "A secondary-source event remains conditional until a company filing, company statement, or other primary source confirms it. Do not present an unconfirmed operating or financial impact as fact.",
    "Keep source linkage implicit through materialChanges IDs; do not add uncited events. Preserve limitations rather than filling evidence gaps.",
    "Do not repeat the same meaning across headline, summary, cases, views, and checks. Avoid generic balance, recommendations, target prices, and unavailable-provider phrasing.",
    "Never frame reader-facing prose as supplied, provided, input, or an observation window. In Korean, use natural particles and Korean currency wording; never leave raw English ticker-plus-earnings phrases or schema-language fragments.",
    "In Korean, use one consistent 합니다/입니다 register and natural investor-facing phrasing; do not stitch technical labels into clipped sentences.",
    "For every estimated upcoming event, call the date and decision point estimated; never call an estimated earnings date confirmed or settled. Keep confirmed events confirmed.",
    "Set changedSincePrevious or stillWatching to null when inapplicable. Do not omit schema fields. Use at most two decimals.",
    JSON.stringify(
      {
        snapshot: promptSnapshot,
        previous:
          previous === undefined
            ? null
            : {
                headline: previous.headline,
                summary: previous.summary,
                materialChanges: previous.materialChanges.map((signal) => ({
                  id: signal.id,
                  title: signal.title,
                  detail: signal.detail,
                })),
                agentViews: previous.agentViews,
                todayChecks: previous.todayChecks,
                bullCase: previous.bullCase,
                bearCase: previous.bearCase,
                attention: previous.attention,
              },
      },
      null,
      2,
    ),
  ].join("\n\n");
}
