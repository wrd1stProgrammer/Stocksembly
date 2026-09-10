import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { codexExecutionContext } from "./codexExecutionContext";
import { productionCodexPlatform } from "./codexPlatform";
import { prepareEphemeralRuntime } from "./codexRuntime";

afterEach(() => vi.unstubAllEnvs());

describe("API authentication isolation (no network)", () => {
  it("rejects API execution when it has not been explicitly enabled", () => {
    vi.stubEnv("STOCKSEMBLY_CODEX_API_ENABLED", "0");
    expect(() => productionCodexPlatform("api")).toThrow();
  });

  it("copies only the separate API credentials and rejects a ChatGPT login for the API lane", async () => {
    const root = await mkdtemp(join(tmpdir(), "stocksembly-api-auth-"));
    const auth = join(root, "auth.json");
    const attempt = join(root, "attempt");
    await mkdir(attempt);
    try {
      const key = { OPENAI_API_KEY: "offline-fixture-key", tokens: null };
      await writeFile(auth, JSON.stringify(key), { mode: 0o600 });
      const runtime = await prepareEphemeralRuntime(auth, attempt, "api");
      expect(
        JSON.parse(await readFile(join(runtime.home, "auth.json"), "utf8")),
      ).toEqual(key);
      await runtime.cleanup();
      await writeFile(
        auth,
        JSON.stringify({ tokens: { access_token: "offline-fixture-token" } }),
      );
      await expect(
        prepareEphemeralRuntime(auth, attempt, "api"),
      ).rejects.toMatchObject({ code: "auth_unavailable" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps simultaneous subscription and API call trees separate", async () => {
    const values = await Promise.all(
      ["subscription", "api"].map((value) =>
        codexExecutionContext.run(
          value === "api" ? "api" : "subscription",
          async () => {
            await Promise.resolve();
            return codexExecutionContext.getStore();
          },
        ),
      ),
    );
    expect(values).toEqual(["subscription", "api"]);
    expect(codexExecutionContext.getStore()).toBeUndefined();
  });
});
