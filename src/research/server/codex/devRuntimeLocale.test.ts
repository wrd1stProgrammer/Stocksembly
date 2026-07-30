import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { CODEX_RUNTIME_PINS } from "./codexPolicy";

it("pins the dev server locale required by Codex readiness", async () => {
  const packageJson = JSON.parse(
    await readFile(join(process.cwd(), "package.json"), "utf8"),
  ) as { scripts?: { dev?: string } };

  expect(packageJson.scripts?.dev).toContain(
    `LANG=${CODEX_RUNTIME_PINS.locale} LC_ALL=${CODEX_RUNTIME_PINS.locale}`,
  );
});
