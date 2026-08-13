import type { Locale } from "../../lib/i18n";
import type {
  BriefingDecisionCheck,
  BriefingSourceSnapshot,
  BriefingUpcomingEvent,
} from "../domain/contracts";

export function sourceBackedDecisionChecks(input: {
  readonly snapshot: BriefingSourceSnapshot;
  readonly events: readonly BriefingUpcomingEvent[];
  readonly model: readonly BriefingDecisionCheck[];
  readonly fallback: readonly BriefingDecisionCheck[];
}): readonly BriefingDecisionCheck[] {
  return Object.freeze(input.fallback.slice(0, 3));
}

export function fallbackDecisionCases(
  locale: Locale,
  snapshot: BriefingSourceSnapshot,
): { readonly bullCase: string; readonly bearCase: string } {
  const references = [
    snapshot.technicalReference?.resistance,
    snapshot.marketReference?.previousHigh,
    snapshot.quote.value,
    snapshot.technicalReference?.support,
    snapshot.marketReference?.previousLow,
  ].filter(
    (value): value is number => value !== undefined && Number.isFinite(value),
  );
  const upper = Math.max(...references);
  const lower = Math.min(...references);
  if (references.length === 0) {
    return locale === "ko"
      ? {
          bullCase:
            "상방 논리는 다음 판정 시점에 공급된 가격 기준을 회복할 때만 강화됩니다.",
          bearCase:
            "하방 논리는 다음 판정 시점에 공급된 가격 기준을 이탈할 때만 강화됩니다.",
        }
      : {
          bullCase:
            "The upside case strengthens only if the next decision window recovers the supplied price reference.",
          bearCase:
            "The downside case strengthens only if the next decision window loses the supplied price reference.",
        };
  }
  const upperPrice = `$${upper.toFixed(2)}`;
  const lowerPrice = `$${lower.toFixed(2)}`;
  return locale === "ko"
    ? {
        bullCase: `상방 논리는 가격이 ${upperPrice} 위에서 유지될 때만 강화됩니다.`,
        bearCase: `하방 논리는 가격이 ${lowerPrice} 아래로 밀릴 때만 강화됩니다.`,
      }
    : {
        bullCase: `The upside case strengthens only if price holds above ${upperPrice}.`,
        bearCase: `The downside case strengthens only if price falls below ${lowerPrice}.`,
      };
}
