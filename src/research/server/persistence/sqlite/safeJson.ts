import { z } from "zod";
import { UnsafePersistenceValueError } from "./errors";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

const forbiddenKey =
  /(?:^|_)(?:body|bytes|prompt|reasoning|secret|stderr|stdout|token|trace)(?:$|_)/i;

function inspectJson(value: JsonValue, path: string): void {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries())
      inspectJson(item, `${path}[${index}]`);
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKey.test(key))
      throw new UnsafePersistenceValueError(
        `${path}.${key}`,
        "private or raw fields are forbidden",
      );
    inspectJson(child, `${path}.${key}`);
  }
}

export function serializeSafeJson(value: JsonValue): string {
  const parsed = z.json().parse(value);
  inspectJson(parsed, "$");
  return JSON.stringify(parsed);
}

export function parseSafeJson(value: string): JsonValue {
  const parsed: unknown = JSON.parse(value);
  return z.json().parse(parsed);
}
