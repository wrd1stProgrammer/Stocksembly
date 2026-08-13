import type {
  BriefingEditionPayload,
  BriefingWatchlistItem,
} from "../domain/contracts";

export type BriefingPreviewEdition = {
  readonly briefingId: string;
  readonly item: BriefingWatchlistItem;
  readonly payload: BriefingEditionPayload;
};

type PreviewHistorySelection = {
  readonly symbol: string;
  readonly locale: BriefingEditionPayload["locale"];
  readonly marketDate: string;
  readonly excludedBriefingId: string;
};

export function selectBriefingPreviewHistory(
  editions: readonly BriefingPreviewEdition[],
  selection: PreviewHistorySelection,
): readonly BriefingPreviewEdition[] {
  return editions
    .filter(
      (edition) =>
        edition.briefingId !== selection.excludedBriefingId &&
        edition.payload.symbol === selection.symbol &&
        edition.payload.locale === selection.locale &&
        edition.payload.marketDate <= selection.marketDate,
    )
    .sort(
      (left, right) =>
        Date.parse(right.payload.generatedAt) -
        Date.parse(left.payload.generatedAt),
    )
    .slice(0, 90);
}
