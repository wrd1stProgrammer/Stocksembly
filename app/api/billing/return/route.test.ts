import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("billing return bridge", () => {
  it("returns local Sandbox checkout to the local Stocksembly home", async () => {
    const response = await GET(
      new Request("https://stocksembly.com/api/billing/return?target=local"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/?billing=success",
    );
  });

  it("returns production checkout to the production Stocksembly home", async () => {
    vi.stubEnv("STOCKSEMBLY_PUBLIC_ORIGIN", "https://stocksembly.com");
    const response = await GET(
      new Request("https://localhost:3000/api/billing/return"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://stocksembly.com/?billing=success",
    );
  });
});
