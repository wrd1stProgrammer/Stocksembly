import type {
  BriefingEarningsSnapshot,
  BriefingEditionPayload,
} from "../../briefing/domain/contracts";
import type { Locale } from "../../lib/i18n";
import { formatBriefingDate } from "./briefingFormatting";
import {
  briefingCopy,
  formatEarningsCurrency,
  formatEarningsPercent,
  nextEarnings,
} from "./briefingPresentation";

type Props = {
  readonly edition: BriefingEditionPayload;
  readonly locale: Locale;
};

type EarningsMetricProps = {
  readonly label: string;
  readonly value: string;
  readonly comparison?: string | undefined;
  readonly direction?: "up" | "down";
  readonly forward?: boolean;
};

function EarningsMetric({
  label,
  value,
  comparison,
  direction,
  forward = false,
}: EarningsMetricProps) {
  return (
    <article data-direction={direction} data-forward={forward || undefined}>
      <span>{label}</span>
      <strong>{value}</strong>
      {comparison === undefined ? null : <small>{comparison}</small>}
    </article>
  );
}

function currency(
  value: number,
  earnings: BriefingEarningsSnapshot,
  compact = false,
): string {
  return formatEarningsCurrency(value, earnings, compact);
}

export function BriefingDetailEarnings({ edition, locale }: Props) {
  const earnings = edition.earnings;
  const copy = briefingCopy(locale);
  const earningsEvent = nextEarnings(edition);
  if (earnings === undefined) return null;

  return (
    <section className="briefing-detail__earnings">
      <header>
        <h3>{copy.earningsSnapshot}</h3>
        <div>
          {earnings.latestReportAt === undefined ? null : (
            <span>
              {copy.latestRelease} ·{" "}
              {formatBriefingDate(earnings.latestReportAt, locale)}
            </span>
          )}
          <strong>
            {copy.earnings} ·{" "}
            {earningsEvent === undefined
              ? copy.earningsPending
              : `${formatBriefingDate(earningsEvent.scheduledAt, locale)}${earningsEvent.certainty === "estimated" ? ` · ${copy.estimated}` : ""}`}
          </strong>
        </div>
      </header>
      <div>
        {earnings.epsActual === undefined ? null : (
          <EarningsMetric
            label={copy.latestEps}
            value={currency(earnings.epsActual, earnings)}
            comparison={
              earnings.epsForecast === undefined
                ? undefined
                : `${copy.consensus} ${currency(earnings.epsForecast, earnings)}`
            }
          />
        )}
        {earnings.epsSurprisePercent === undefined ? null : (
          <EarningsMetric
            label={copy.epsSurprise}
            value={formatEarningsPercent(earnings.epsSurprisePercent)}
            direction={earnings.epsSurprisePercent >= 0 ? "up" : "down"}
          />
        )}
        {earnings.revenueActual === undefined ? null : (
          <EarningsMetric
            label={copy.latestRevenue}
            value={currency(earnings.revenueActual, earnings, true)}
            comparison={
              earnings.revenueForecast === undefined
                ? undefined
                : `${copy.consensus} ${currency(earnings.revenueForecast, earnings, true)}`
            }
          />
        )}
        {earnings.revenueSurprisePercent === undefined ? null : (
          <EarningsMetric
            label={copy.revenueSurprise}
            value={formatEarningsPercent(earnings.revenueSurprisePercent)}
            direction={earnings.revenueSurprisePercent >= 0 ? "up" : "down"}
          />
        )}
        {earnings.nextEpsForecast === undefined ? null : (
          <EarningsMetric
            label={copy.nextEpsConsensus}
            value={currency(earnings.nextEpsForecast, earnings)}
            forward
          />
        )}
        {earnings.nextRevenueForecast === undefined ? null : (
          <EarningsMetric
            label={copy.nextRevenueConsensus}
            value={currency(earnings.nextRevenueForecast, earnings, true)}
            forward
          />
        )}
      </div>
    </section>
  );
}
