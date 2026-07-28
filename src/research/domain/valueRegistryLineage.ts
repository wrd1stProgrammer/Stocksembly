import { ContractViolation, hashCanonical } from "./contractHelpers";
import type {
  ValueDraft,
  ValueFormula,
  ValueRecord,
  ValueRegistry,
} from "./valueRegistrySchema";

type ParentInput = Pick<ValueDraft, "parentValueIds" | "parentHashes"> & {
  readonly formula?: ValueFormula;
};

function parentRecord(registry: ValueRegistry, valueId: string): ValueRecord {
  const record = registry.records.find(
    (candidate) => candidate.valueId === valueId,
  );
  if (record === undefined)
    throw new ContractViolation(
      "missing_parent",
      `formula parent ${valueId} is not registered in this snapshot`,
    );
  return record;
}

export function assertParentLineage(
  registry: ValueRegistry,
  input: ParentInput,
): void {
  if (input.formula === undefined) return;
  const parentValueIds = input.parentValueIds ?? [];
  const parentHashes = input.parentHashes ?? [];
  if (
    input.formula.inputValueIds.length !== parentValueIds.length ||
    input.formula.inputValueIds.some(
      (valueId, index) => valueId !== parentValueIds[index],
    )
  )
    throw new ContractViolation(
      "formula_parent_order",
      "formula input IDs must equal ordered parentValueIds",
    );
  if (parentHashes.length !== parentValueIds.length)
    throw new ContractViolation(
      "parent_hash_missing",
      "every formula parent requires a matching content hash",
    );
  parentValueIds.forEach((valueId, index) => {
    const parent = parentRecord(registry, valueId);
    if (
      parent.runId !== registry.runId ||
      parent.snapshotId !== registry.snapshotId
    )
      throw new ContractViolation(
        "lineage_mismatch",
        `formula parent ${valueId} crosses run or snapshot lineage`,
      );
    const { hash: _hash, ...withoutHash } = parent;
    if (hashCanonical(withoutHash) !== parent.hash)
      throw new ContractViolation(
        "parent_hash_mismatch",
        `formula parent ${valueId} has a mismatched record hash`,
      );
    if (parent.hash !== parentHashes[index])
      throw new ContractViolation(
        "parent_hash_mismatch",
        `formula parent ${valueId} has a mismatched content hash`,
      );
  });
}
