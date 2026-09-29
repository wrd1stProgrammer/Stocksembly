import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { z } from "zod";
import { CodexRunnerError } from "./codexErrors";

export async function openAiApiKey(): Promise<string> {
  const direct = process.env["OPENAI_API_KEY"]?.trim();
  if (direct) return direct;
  const path = process.env["STOCKSEMBLY_CODEX_API_AUTH_PATH"]?.trim();
  if (!path) throw new CodexRunnerError("auth_unavailable");
  try {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (
        !stat.isFile() ||
        stat.size > 65536 ||
        (stat.mode & 0o777) !== 0o600 ||
        stat.uid !== process.getuid?.()
      )
        throw new Error("Invalid credential file");
      return z
        .object({
          OPENAI_API_KEY: z.string().trim().min(1),
          tokens: z.null().optional(),
        })
        .parse(JSON.parse(await file.readFile("utf8"))).OPENAI_API_KEY;
    } finally {
      await file.close();
    }
  } catch {
    throw new CodexRunnerError("auth_unavailable");
  }
}
