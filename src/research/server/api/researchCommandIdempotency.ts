import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import {
  type JsonValue,
  parseSafeJson,
  serializeSafeJson,
} from "../persistence/sqlite/safeJson";

const RowSchema = z.object({
  request_hash: z.string(),
  result_json: z.string(),
});

export function commandDigest(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function replayCommand(
  database: Database.Database,
  scope: string,
  key: string,
  requestHash: string,
):
  | { readonly kind: "missing" }
  | { readonly kind: "conflict" }
  | {
      readonly kind: "replayed";
      readonly value: unknown;
    } {
  const found = database
    .prepare(`SELECT request_hash, result_json FROM idempotency_records
      WHERE scope = ? AND idempotency_key = ?`)
    .get(scope, key);
  if (found === undefined) return { kind: "missing" };
  const row = RowSchema.parse(found);
  return row.request_hash === requestHash
    ? { kind: "replayed", value: parseSafeJson(row.result_json) }
    : { kind: "conflict" };
}

export function commitCommand(
  database: Database.Database,
  input: {
    readonly scope: string;
    readonly key: string;
    readonly requestHash: string;
    readonly value: JsonValue;
    readonly now: string;
  },
): void {
  database
    .prepare(`INSERT INTO idempotency_records(
      scope, idempotency_key, request_hash, result_json, created_at
    ) VALUES (@scope, @key, @requestHash, @resultJson, @now)`)
    .run({ ...input, resultJson: serializeSafeJson(input.value) });
}
