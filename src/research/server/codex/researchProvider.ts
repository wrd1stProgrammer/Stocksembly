import { createHash } from "node:crypto";

export function usesOpenAiApi(): boolean {
  const provider = process.env["STOCKSEMBLY_RESEARCH_PROVIDER"] ?? "codex";
  if (provider !== "openai" && provider !== "codex")
    throw new Error("Invalid STOCKSEMBLY_RESEARCH_PROVIDER");
  return provider === "openai";
}

export const OPENAI_RESEARCH_MODEL = "gpt-6-luna" as const;
export const OPENAI_RUNNER_VERSION = "openai-responses-v1" as const;
// Existing database columns retain their names; this is an adapter identity,
// not a claim that a Codex executable was launched.
export const OPENAI_RUNNER_HASH = createHash("sha256")
  .update(OPENAI_RUNNER_VERSION)
  .digest("hex");
