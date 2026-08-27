import { BorderBeam } from "border-beam";
import { CalendarDays, ChevronRight } from "lucide-react";
import type { BriefingListItem } from "../../briefing/domain/contracts";
import type { AppLocale } from "../../lib/i18n";
import { CompanyLogo } from "../research/ResearchSidebar";
import { formatBriefingDate, formatBriefingPrice } from "./briefingFormatting";
import { briefingRoomUiCopy } from "./briefingRoomUiCopy";

type Props = {
  readonly briefing: BriefingListItem;
  readonly locale: AppLocale;
  readonly featured?: boolean;
  readonly onOpen: (briefing: BriefingListItem) => void;
};

export function BriefingCard({ briefing, locale, featured, onOpen }: Props) {
  const labels = briefingRoomUiCopy[locale].card;
  const earnings = briefing.nextEarnings;
  const change = briefing.price.changePercent;

  const card = (
    <button
      type="button"
      className="briefing-card"
      data-attention={briefing.attention}
      data-unread={briefing.unread ? "true" : "false"}
      onClick={() => onOpen(briefing)}
    >
      <header>
        <CompanyLogo symbol={briefing.symbol} />
        <span className="briefing-card__company">
          <strong>{briefing.symbol}</strong>
          <small>{briefing.company}</small>
        </span>
        <span className="briefing-card__top-meta">
          {briefing.unread ? (
            <span className="briefing-card__unread">
              <i aria-hidden="true" />
              {labels.unread}
            </span>
          ) : null}
          <span className="briefing-card__earnings">
            <span>
              <CalendarDays size={11} aria-hidden="true" /> {labels.earnings}
            </span>
            <strong>
              {earnings === undefined
                ? labels.pending
                : formatBriefingDate(earnings.scheduledAt, locale)}
            </strong>
            {earnings === undefined ? null : (
              <small>
                {earnings.certainty === "confirmed"
                  ? labels.confirmed
                  : labels.estimated}
              </small>
            )}
          </span>
        </span>
      </header>

      <div className="briefing-card__quote">
        <strong>
          {formatBriefingPrice(briefing.price.value, briefing.price.currency)}
        </strong>
        <span data-direction={(change ?? 0) >= 0 ? "up" : "down"}>
          {change === undefined
            ? "—"
            : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
        </span>
      </div>

      <h3>{briefing.headline}</h3>

      <footer>
        <span className="briefing-card__attention">
          <i aria-hidden="true" /> {labels.attention[briefing.attention]}
        </span>
        <time>{formatBriefingDate(briefing.generatedAt, locale, true)}</time>
        <ChevronRight size={15} />
      </footer>
    </button>
  );
  if (!featured) return card;
  return (
    <BorderBeam
      className="briefing-card-beam"
      size="pulse-inner"
      colorVariant="mono"
      strength={0.97}
    >
      {card}
    </BorderBeam>
  );
}
