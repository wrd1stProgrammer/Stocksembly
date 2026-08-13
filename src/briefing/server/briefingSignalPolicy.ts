import type {
  BriefingEditionPayload,
  BriefingSignal,
  BriefingSourceSnapshot,
  BriefingUpcomingEvent,
} from "../domain/contracts";

export function normalizedTerms(value: string): ReadonlySet<string> {
  return new Set(
    value
      .toLowerCase()
      .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
      .split(" ")
      .filter((term) => term.length >= 3),
  );
}

export function briefingTextSimilarity(left: string, right: string): number {
  const leftTerms = normalizedTerms(left);
  const rightTerms = normalizedTerms(right);
  if (leftTerms.size === 0 || rightTerms.size === 0) return 0;
  let overlap = 0;
  for (const term of leftTerms) if (rightTerms.has(term)) overlap += 1;
  return overlap / (leftTerms.size + rightTerms.size - overlap);
}

function priceReferenceBand(
  value: number,
  snapshot: BriefingSourceSnapshot,
): number | undefined {
  const boundaries = [
    snapshot.marketReference?.previousLow,
    snapshot.marketReference?.previousHigh,
    snapshot.technicalReference?.support,
    snapshot.technicalReference?.resistance,
  ]
    .filter((boundary): boundary is number => boundary !== undefined)
    .filter(Number.isFinite);
  if (boundaries.length === 0) return undefined;
  return boundaries.filter((boundary) => value > boundary).length;
}

function isNovelPriceSignal(
  snapshot: BriefingSourceSnapshot,
  previous: BriefingEditionPayload | undefined,
): boolean {
  const currentValue = snapshot.quote.value;
  const previousValue = previous?.price.value;
  if (currentValue === undefined || previousValue === undefined) return false;
  const currentBand = priceReferenceBand(currentValue, snapshot);
  const previousBand = priceReferenceBand(previousValue, snapshot);
  return (
    currentBand !== undefined &&
    previousBand !== undefined &&
    currentBand !== previousBand
  );
}

export function novelBriefingSignals(
  snapshot: BriefingSourceSnapshot,
  previous: BriefingEditionPayload | undefined,
): readonly BriefingSignal[] {
  return snapshot.signals.filter((signal) => {
    if (signal.kind === "price") return isNovelPriceSignal(snapshot, previous);
    if (previous === undefined) return true;
    return !previous.materialChanges.some(
      (prior) =>
        prior.id === signal.id ||
        briefingTextSimilarity(
          `${prior.title} ${prior.detail}`,
          `${signal.title} ${signal.detail}`,
        ) >= 0.68,
    );
  });
}

export function isEarningsEventName(name: string): boolean {
  return /earnings|results|실적/iu.test(name);
}

export function confirmedEarningsEvent(
  snapshot: BriefingSourceSnapshot,
): BriefingUpcomingEvent | undefined {
  return snapshot.upcomingEvents.find(
    (event) =>
      event.certainty === "confirmed" && isEarningsEventName(event.name),
  );
}

export function nextEarningsEvent(
  snapshot: BriefingSourceSnapshot,
): BriefingUpcomingEvent | undefined {
  return snapshot.upcomingEvents.find((event) =>
    isEarningsEventName(event.name),
  );
}

export function publicUpcomingEvents(
  snapshot: BriefingSourceSnapshot,
): readonly BriefingUpcomingEvent[] {
  return snapshot.upcomingEvents;
}

export function briefingAttention(
  snapshot: BriefingSourceSnapshot,
  signals: readonly BriefingSignal[],
): BriefingEditionPayload["attention"] {
  const change = Math.abs(snapshot.quote.changePercent ?? 0);
  const riskSignals = signals.filter(
    (signal) => signal.kind === "risk" || signal.direction === "negative",
  ).length;
  const imminent = snapshot.upcomingEvents.some(
    (event) =>
      Date.parse(event.scheduledAt) - Date.parse(snapshot.cutoffAt) <=
      3 * 24 * 60 * 60 * 1_000,
  );
  const outsidePreviousRange =
    snapshot.quote.value !== undefined &&
    ((snapshot.marketReference?.previousLow !== undefined &&
      snapshot.quote.value < snapshot.marketReference.previousLow) ||
      (snapshot.marketReference?.previousHigh !== undefined &&
        snapshot.quote.value > snapshot.marketReference.previousHigh));
  if (change >= 3 || riskSignals >= 2 || (signals.length >= 3 && imminent))
    return "high";
  if (change >= 1 || signals.length > 0 || imminent || outsidePreviousRange)
    return "medium";
  return "low";
}
