import { z } from "zod";
import { RunIdSchema } from "../../domain/ids";
import type { PublicRun, RunCursor } from "./researchApiContracts";

const CursorSchema = z.tuple([z.string().datetime(), RunIdSchema]);

export function encodeRunCursor(run: PublicRun): string {
  return Buffer.from(
    JSON.stringify([run.createdAt, run.runId]),
    "utf8",
  ).toString("base64url");
}

export function decodeRunCursor(input: string | null): RunCursor | undefined {
  if (input === null) return undefined;
  try {
    const parsed = CursorSchema.safeParse(
      JSON.parse(Buffer.from(input, "base64url").toString("utf8")),
    );
    return parsed.success
      ? { createdAt: parsed.data[0], runId: parsed.data[1] }
      : undefined;
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}
