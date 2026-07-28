import { timestampMillis } from "../domain/contractHelpers";
import type { ValueRegistry } from "../domain/valueRegistry";
import { ValueRecordSchema, valueRecordHash } from "../domain/valueRegistry";
import type {
  SnapshotEvidence,
  SnapshotIdentity,
} from "./buildSnapshotContracts";
import { SnapshotBuildError } from "./buildSnapshotValidation";

function fail(code: string, message: string): never {
  throw new SnapshotBuildError(code, message);
}

export function verifyValueRegistry(
  registry: ValueRegistry,
  context: {
    readonly runId: string;
    readonly snapshotId: string;
    readonly evidenceCutoffAt: string;
  },
): void {
  if (
    registry.runId !== context.runId ||
    registry.snapshotId !== context.snapshotId
  )
    fail("cross_run", "value registry crosses run or snapshot lineage");
  const records = new Map(
    registry.records.map((record) => [record.valueId, record]),
  );
  if (records.size !== registry.records.length)
    fail("value_duplicate", "value registry contains duplicate IDs");
  for (const raw of registry.records) {
    const record = ValueRecordSchema.parse(raw);
    if (
      record.runId !== context.runId ||
      record.snapshotId !== context.snapshotId
    )
      fail("cross_run", `value ${record.valueId} crosses snapshot lineage`);
    if (valueRecordHash(record) !== record.hash)
      fail("value_hash_mismatch", `value ${record.valueId} has a bad hash`);
    if (
      record.evidenceCutoffAt === undefined ||
      timestampMillis(record.evidenceCutoffAt) !==
        timestampMillis(context.evidenceCutoffAt)
    )
      fail("cutoff_mismatch", "value registry uses another cutoff");
    record.parentValueIds.forEach((parentId, index) => {
      const parent = records.get(parentId);
      if (parent === undefined)
        fail("value_parent_missing", `value parent ${parentId} is missing`);
      if (
        parent.runId !== context.runId ||
        parent.snapshotId !== context.snapshotId
      )
        fail("cross_run", `value parent ${parentId} crosses snapshot lineage`);
      if (valueRecordHash(parent) !== parent.hash)
        fail("value_parent_hash", `value parent ${parentId} has a bad hash`);
      if (record.parentHashes[index] !== parent.hash)
        fail("value_parent_hash", `value parent ${parentId} edge is invalid`);
    });
  }
}

type FilingEvidence = SnapshotEvidence & {
  readonly accessionNumber: string;
  readonly acceptedAt: string;
  readonly cik: string;
  readonly filedAt: string;
  readonly form: string;
};

function filingEvidence(
  evidence: SnapshotEvidence,
  identity: SnapshotIdentity,
): FilingEvidence | undefined {
  if (evidence.dataset !== "sec_filing") return undefined;
  if (
    evidence.accessionNumber === undefined ||
    evidence.acceptedAt === undefined ||
    evidence.cik === undefined ||
    evidence.filedAt === undefined ||
    evidence.form === undefined
  )
    fail("filing_lineage_missing", "filing lineage fields are required");
  if (evidence.cik !== identity.cik)
    fail("amendment_cross_issuer", "filing belongs to another issuer");
  return {
    ...evidence,
    accessionNumber: evidence.accessionNumber,
    acceptedAt: evidence.acceptedAt,
    cik: evidence.cik,
    filedAt: evidence.filedAt,
    form: evidence.form,
  };
}

function formFamily(form: string): string {
  return form.endsWith("/A") ? form.slice(0, -2) : form;
}

export function verifyAmendmentLineage(
  evidence: readonly SnapshotEvidence[],
  identity: SnapshotIdentity,
): void {
  const filings = evidence
    .map((item) => filingEvidence(item, identity))
    .filter((item): item is FilingEvidence => item !== undefined);
  const byAccession = new Map(
    filings.map((filing) => [filing.accessionNumber, filing]),
  );
  if (byAccession.size !== filings.length)
    fail("filing_duplicate", "filing accession is duplicated");
  const active = new Set<string>();
  const visited = new Set<string>();
  const visit = (filing: FilingEvidence): void => {
    if (active.has(filing.accessionNumber))
      fail("amendment_cycle", "filing amendment lineage contains a cycle");
    if (visited.has(filing.accessionNumber)) return;
    active.add(filing.accessionNumber);
    if (filing.parentAccessionNumber !== undefined) {
      const parent = byAccession.get(filing.parentAccessionNumber);
      if (parent === undefined)
        fail("amendment_parent_missing", "amendment parent is absent");
      visit(parent);
    }
    active.delete(filing.accessionNumber);
    visited.add(filing.accessionNumber);
  };
  for (const filing of filings) visit(filing);
  for (const filing of filings) {
    const parentId = filing.parentAccessionNumber;
    if (filing.form.endsWith("/A") && parentId === undefined)
      fail("amendment_parent_missing", "amendment has no parent accession");
    if (parentId === undefined) continue;
    const parent = byAccession.get(parentId);
    if (parent === undefined)
      fail("amendment_parent_missing", "amendment parent is absent");
    if (
      !filing.form.endsWith("/A") ||
      formFamily(filing.form) !== formFamily(parent.form)
    )
      fail("amendment_form_family", "amendment crosses form families");
    if (
      timestampMillis(parent.acceptedAt) >= timestampMillis(filing.acceptedAt)
    )
      fail("amendment_order", "amendment parent must precede its child");
  }
}
