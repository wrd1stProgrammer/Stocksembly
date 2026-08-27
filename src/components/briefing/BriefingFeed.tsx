import { CalendarClock, Plus } from "lucide-react";
import type { BriefingListItem } from "../../briefing/domain/contracts";
import type { AppLocale } from "../../lib/i18n";
import { BriefingCard } from "./BriefingCard";
import { briefingRoomUiCopy } from "./briefingRoomUiCopy";

type BriefingGroups = {
  readonly latest: readonly BriefingListItem[];
  readonly history: readonly BriefingListItem[];
};

type Props = {
  readonly locale: AppLocale;
  readonly watchlistCount: number;
  readonly briefings: readonly BriefingListItem[];
  readonly onAdd: () => void;
  readonly onOpen: (briefing: BriefingListItem) => void;
};

export function groupBriefings(
  briefings: readonly BriefingListItem[],
): BriefingGroups {
  const latestIds = new Map<string, string>();
  const latestTimes = new Map<string, number>();
  for (const briefing of briefings) {
    const generatedAt = Date.parse(briefing.generatedAt);
    const currentTime = latestTimes.get(briefing.symbol);
    if (currentTime === undefined || generatedAt > currentTime) {
      latestTimes.set(briefing.symbol, generatedAt);
      latestIds.set(briefing.symbol, briefing.briefingId);
    }
  }
  return briefings.reduce<{
    latest: BriefingListItem[];
    history: BriefingListItem[];
  }>(
    (groups, briefing) => {
      const destination =
        latestIds.get(briefing.symbol) === briefing.briefingId
          ? groups.latest
          : groups.history;
      destination.push(briefing);
      return groups;
    },
    { latest: [], history: [] },
  );
}

function BriefingGroup({
  title,
  briefings,
  locale,
  featured = false,
  onOpen,
}: {
  readonly title: string;
  readonly briefings: readonly BriefingListItem[];
  readonly locale: AppLocale;
  readonly featured?: boolean;
  readonly onOpen: Props["onOpen"];
}) {
  if (briefings.length === 0) return null;
  return (
    <section className="briefing-feed__group">
      <header>
        <h2>{title}</h2>
        <span>{briefings.length}</span>
      </header>
      <div className="briefing-feed__grid">
        {briefings.map((briefing) => (
          <BriefingCard
            key={briefing.briefingId}
            briefing={briefing}
            locale={locale}
            featured={featured}
            onOpen={onOpen}
          />
        ))}
      </div>
    </section>
  );
}

export function BriefingFeed({
  locale,
  watchlistCount,
  briefings,
  onAdd,
  onOpen,
}: Props) {
  const labels = briefingRoomUiCopy[locale].feed;
  if (watchlistCount === 0)
    return (
      <section className="briefing-feed">
        <div className="briefing-feed__empty">
          <Plus size={22} />
          <h2>{labels.emptyTitle}</h2>
          <p>{labels.emptyBody}</p>
          <button type="button" onClick={onAdd}>
            {labels.add}
          </button>
        </div>
      </section>
    );
  if (briefings.length === 0)
    return (
      <section className="briefing-feed">
        <div className="briefing-feed__empty">
          <CalendarClock size={24} />
          <h2>{labels.noEditionTitle}</h2>
          <p>{labels.noEditionBody}</p>
        </div>
      </section>
    );

  const groups = groupBriefings(briefings);
  return (
    <section className="briefing-feed">
      <BriefingGroup
        title={labels.latest}
        briefings={groups.latest}
        locale={locale}
        featured
        onOpen={onOpen}
      />
      <BriefingGroup
        title={labels.history}
        briefings={groups.history}
        locale={locale}
        onOpen={onOpen}
      />
    </section>
  );
}
