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

export type ModelOutputLocale = "en" | "ko";

function localizedSchemaDocument(
  value: unknown,
  locale: ModelOutputLocale,
): unknown {
  if (Array.isArray(value))
    return value.map((entry) => localizedSchemaDocument(entry, locale));
  if (typeof value !== "object" || value === null) return value;
  const source = value as Record<string, unknown>;
  const properties = source["properties"];
  const required = source["required"];
  const isLocalizedObject =
    typeof properties === "object" &&
    properties !== null &&
    Object.hasOwn(properties, "en") &&
    Object.hasOwn(properties, "ko") &&
    Array.isArray(required) &&
    required.includes("en") &&
    required.includes("ko");
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (isLocalizedObject && key === "properties") {
      const localized = properties as Record<string, unknown>;
      result[key] = {
        [locale]: localizedSchemaDocument(localized[locale], locale),
      };
    } else if (isLocalizedObject && key === "required") {
      result[key] = [locale];
    } else {
      result[key] = localizedSchemaDocument(entry, locale);
    }
  }
  return result;
}

export function schemaDocument(
  schema: z.ZodType,
  locale?: ModelOutputLocale,
): unknown {
  let document: unknown;
  try {
    document = normalizeSchema(z.toJSONSchema(schema));
    if (locale !== undefined)
      document = localizedSchemaDocument(document, locale);
  } catch {
    throw new CodexRunnerError("policy_violation");
  }
  if (encodedJson(document).byteLength > CODEX_RUNTIME_POLICY.maxSchemaBytes)
    throw new CodexRunnerError("policy_violation");
  return document;
}

function localeFromLocalizedValues(
  value: unknown,
): ModelOutputLocale | undefined {
  let english = 0;
  let korean = 0;
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (typeof candidate !== "object" || candidate === null) return;
    const record = candidate as Record<string, unknown>;
    if (typeof record["en"] === "string" && record["en"] === record["ko"]) {
      const text = record["en"];
      if (/\p{Script=Hangul}/u.test(text)) korean += 1;
      else if (/\p{Script=Latin}/u.test(text)) english += 1;
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  if (english === korean) return undefined;
  return korean > english ? "ko" : "en";
}

export function modelOutputLocale(
  prompt: string,
): ModelOutputLocale | undefined {
  const explicit = prompt.match(/"locale"\s*:\s*"(en|ko)"/u)?.[1];
  if (explicit === "en" || explicit === "ko") return explicit;
  const jsonStart = prompt.indexOf("{");
  if (jsonStart < 0) return undefined;
  try {
    return localeFromLocalizedValues(JSON.parse(prompt.slice(jsonStart)));
  } catch {
    return undefined;
  }
}

export function effectiveCodexPrompt(
  prompt: string,
  locale = modelOutputLocale(prompt),
): string {
  if (locale === undefined) return prompt;
  const language = locale === "ko" ? "natural Korean" : "natural English";
  return `${prompt}\n\nOUTPUT LANGUAGE CONTRACT (this supersedes any earlier bilingual-output instruction): Write all public text in ${language}. For every localized text object whose language keys are en and ko, return only the ${locale} key and omit the other language key. Do not translate or duplicate the same text into the omitted key.`;
}

export function hydrateLocalizedCandidate(
  value: unknown,
  locale: ModelOutputLocale,
): unknown {
  if (Array.isArray(value))
    return value.map((entry) => hydrateLocalizedCandidate(entry, locale));
  if (typeof value !== "object" || value === null) return value;
  const source = value as Record<string, unknown>;
  const keys = Object.keys(source);
  const other = locale === "ko" ? "en" : "ko";
  if (
    keys.length === 1 &&
    keys[0] === locale &&
    typeof source[locale] === "string"
  ) {
    return { [locale]: source[locale], [other]: source[locale] };
  }
  return Object.fromEntries(
    Object.entries(source).map(([key, entry]) => [
      key,
      hydrateLocalizedCandidate(entry, locale),
    ]),
  );
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
