import { CalendarClock, Plus } from "lucide-react";
import type { BriefingListItem } from "../../briefing/domain/contracts";
import type { Locale } from "../../lib/i18n";
import { BriefingCard } from "./BriefingCard";

type BriefingGroups = {
  readonly latest: readonly BriefingListItem[];
  readonly history: readonly BriefingListItem[];
};

type Props = {
  readonly locale: Locale;
  readonly watchlistCount: number;
  readonly briefings: readonly BriefingListItem[];
  readonly onAdd: () => void;
  readonly onOpen: (briefing: BriefingListItem) => void;
};

const copy = {
  ko: {
    latest: "최신 브리핑",
    history: "이전 브리핑",
    emptyTitle: "첫 브리핑을 준비할 종목을 추가하세요",
    emptyBody:
      "직전 발행 이후의 변화와 다음 촉매만 추려서 장 시작 전에 전달합니다.",
    noEditionTitle: "다음 프리마켓 브리핑부터 시작됩니다",
    noEditionBody:
      "관심종목 등록이 끝났습니다. 다음 미국 거래일 장 시작 한 시간 전에 새 브리핑이 도착합니다.",
    add: "종목 추가",
  },
  en: {
    latest: "Latest briefings",
    history: "Briefing history",
    emptyTitle: "Add a stock for its first briefing",
    emptyBody:
      "Each edition isolates the changes and catalysts that matter before the open.",
    noEditionTitle: "Briefings begin at the next pre-market run",
    noEditionBody:
      "Your watchlist is ready. A new edition arrives one hour before the next US market open.",
    add: "Add stock",
  },
} as const;

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
  readonly locale: Locale;
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
  const labels = copy[locale];
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
