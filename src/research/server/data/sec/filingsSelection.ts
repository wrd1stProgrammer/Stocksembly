import type { FilingMetadata } from "./filingsPayload";

const COLLECTED_FORMS = new Set(["10-K", "10-K/A", "10-Q", "10-Q/A", "8-K"]);

export type SelectedFiling = FilingMetadata & {
  readonly parentAccessionNumber?: string;
};

function latestBefore(
  records: readonly FilingMetadata[],
  form: string,
  period: string,
  acceptedAt: string,
): FilingMetadata | undefined {
  return records
    .filter(
      (record) =>
        record.form === form &&
        record.period === period &&
        record.acceptedAt < acceptedAt,
    )
    .sort((left, right) => right.acceptedAt.localeCompare(left.acceptedAt))[0];
}

export function selectFilingChain(
  records: readonly FilingMetadata[],
  cutoffAt: string,
): readonly SelectedFiling[] | undefined {
  const cutoff = Date.parse(cutoffAt);
  const eligible = records.filter(
    (record) =>
      COLLECTED_FORMS.has(record.form) &&
      Date.parse(record.acceptedAt) <= cutoff &&
      Date.parse(record.filedAt) <= cutoff,
  );
  const annual = eligible
    .filter((record) => record.form === "10-K")
    .sort((left, right) => right.acceptedAt.localeCompare(left.acceptedAt))[0];
  if (annual === undefined) return undefined;
  const selected = eligible.filter((record) => {
    if (record.accessionNumber === annual.accessionNumber) return true;
    if (record.acceptedAt < annual.acceptedAt) return false;
    switch (record.form) {
      case "10-K":
        return false;
      case "10-K/A":
        return record.period === annual.period;
      case "10-Q":
      case "8-K":
        return true;
      case "10-Q/A":
        return (
          latestBefore(eligible, "10-Q", record.period, record.acceptedAt) !==
          undefined
        );
      default:
        return false;
    }
  });
  return Object.freeze(
    selected
      .sort((left, right) => left.acceptedAt.localeCompare(right.acceptedAt))
      .map((record): SelectedFiling => {
        if (record.form === "10-K/A")
          return Object.freeze({
            ...record,
            parentAccessionNumber: annual.accessionNumber,
          });
        if (record.form === "10-Q/A") {
          const parent = latestBefore(
            eligible,
            "10-Q",
            record.period,
            record.acceptedAt,
          );
          return parent === undefined
            ? Object.freeze(record)
            : Object.freeze({
                ...record,
                parentAccessionNumber: parent.accessionNumber,
              });
        }
        return Object.freeze(record);
      }),
  );
}
