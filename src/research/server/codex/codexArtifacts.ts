import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { CodexRunnerError } from "./codexErrors";
import { CODEX_RUNTIME_POLICY } from "./codexPolicy";

export const ATTEMPT_FILE_NAMES = [
  "codex-bin",
  "output-schema.json",
  "launch-manifest.json",
  "tool-transcript.json",
  "final-candidate.json",
  "lifecycle.json",
] as const;

function encodedJson(value: unknown): Buffer {
  try {
    return Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
  } catch {
    throw new CodexRunnerError("output_invalid");
  }
}

export function sha256Value(value: unknown): string {
  return createHash("sha256").update(encodedJson(value)).digest("hex");
}

export function schemaDocument(schema: z.ZodType): unknown {
  let document: unknown;
  try {
    document = normalizeSchema(z.toJSONSchema(schema));
  } catch {
    throw new CodexRunnerError("policy_violation");
  }
  if (encodedJson(document).byteLength > CODEX_RUNTIME_POLICY.maxSchemaBytes)
    throw new CodexRunnerError("policy_violation");
  return document;
}

function normalizeSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeSchema);
  if (typeof value !== "object" || value === null) return value;
  const normalized: Record<string, unknown> & { enum?: readonly unknown[] } =
    {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "const") normalized.enum = [normalizeSchema(entry)];
    else normalized[key] = normalizeSchema(entry);
  }
  return normalized;
}

export async function writeExclusiveJson(
  attemptDir: string,
  name: (typeof ATTEMPT_FILE_NAMES)[number],
  value: unknown,
): Promise<void> {
  if (name === "codex-bin") throw new CodexRunnerError("policy_violation");
  try {
    const bytes = encodedJson(value);
    const handle = await open(
      join(attemptDir, name),
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600,
    );
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      bytes.fill(0);
      await handle.close();
    }
    const directory = await open(attemptDir, constants.O_RDONLY);
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (error) {
    if (error instanceof CodexRunnerError) throw error;
    throw new CodexRunnerError("process_failed");
  }
}
