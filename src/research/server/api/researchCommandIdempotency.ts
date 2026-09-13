import { createHash } from "node:crypto";
import { z } from "zod";
import type { ResearchDatabase } from "../persistence/postgres/database";
import {
  type JsonValue,
  parseSafeJson,
  serializeSafeJson,
} from "../persistence/postgres/safeJson";

const RowSchema = z.object({
  request_hash: z.string(),
  result_json: z.string(),
});

export function commandDigest(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export async function replayCommand(
  database: ResearchDatabase,
  scope: string,
  key: string,
  requestHash: string,
): Promise<
  | { readonly kind: "missing" }
  | { readonly kind: "conflict" }
  | {
      readonly kind: "replayed";
      readonly value: unknown;
    }
> {
  const found = (
    await database.query(
      `SELECT request_hash, result_json FROM idempotency_records
      WHERE scope = $1 AND idempotency_key = $2`,
      [scope, key],
    )
  ).rows[0];
  if (found === undefined) return { kind: "missing" };
  const row = RowSchema.parse(found);
  return row.request_hash === requestHash
    ? { kind: "replayed", value: parseSafeJson(row.result_json) }
    : { kind: "conflict" };
}

export async function commitCommand(
  database: ResearchDatabase,
  input: {
    readonly scope: string;
    readonly key: string;
    readonly requestHash: string;
    readonly value: JsonValue;
    readonly now: string;
  },
): Promise<void> {
  await database.query(
    `INSERT INTO idempotency_records(
      scope, idempotency_key, request_hash, result_json, created_at
    ) VALUES ($1, $2, $3, $4, $5)`,
    [
      input.scope,
      input.key,
      input.requestHash,
      serializeSafeJson(input.value),
      input.now,
    ],
  );
}
