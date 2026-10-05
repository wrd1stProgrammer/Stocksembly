import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLiveResearchApi,
  researchDispatchIsReady,
} from "./liveResearchApi";

afterEach(() => vi.unstubAllEnvs());
it("fails closed before opening the DB when production authentication is missing", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("STOCKSEMBLY_PUBLIC_ORIGIN", "");
  await expect(createLiveResearchApi()).rejects.toThrow(
    "STOCKSEMBLY_PUBLIC_ORIGIN_REQUIRED",
  );
  vi.stubEnv("STOCKSEMBLY_PUBLIC_ORIGIN", "https://stocksembly.com");
  vi.stubEnv("STOCKSEMBLY_COGNITO_USER_POOL_ID", "");
  vi.stubEnv("STOCKSEMBLY_COGNITO_CLIENT_ID", "");
  await expect(createLiveResearchApi()).rejects.toThrow(
    "STOCKSEMBLY_COGNITO_CONFIGURATION_REQUIRED",
  );
});

describe("live research dispatch admission", () => {
  it("admits local research and requires the production queue", () => {
    expect(researchDispatchIsReady(true, false)).toBe(true);
    expect(researchDispatchIsReady(false, true)).toBe(true);
    expect(researchDispatchIsReady(false, false)).toBe(false);
  });
});
