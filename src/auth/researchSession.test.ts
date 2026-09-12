import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enforceRequestPolicy } from "../research/server/http/requestPolicy";
import { clearResearchSession } from "./researchSession";

vi.mock("aws-amplify/auth", () => ({ fetchAuthSession: vi.fn() }));
vi.mock("./amplifyClient", () => ({ configureAmplifyAuth: () => false }));

describe("research session logout", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("reaches cookie deletion through the actual same-origin mutation policy", async () => {
    let cookie = "stocksembly_cognito_session=previous-session";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init: RequestInit) => {
        const headers = new Headers(init.headers);
        headers.set("host", "localhost:3000");
        headers.set("origin", "http://localhost:3000");
        headers.set("sec-fetch-site", "same-origin");
        const policy = await enforceRequestPolicy(
          new Request(`http://localhost:3000${input}`, { ...init, headers }),
          {
            mutation: true,
            allowedHost: "localhost:3000",
            allowedOrigin: "http://localhost:3000",
          },
        );
        if (policy.kind === "rejected")
          return new Response(null, { status: policy.status });
        cookie = "";
        return new Response(null, {
          status: 204,
          headers: { "x-stocksembly-session-changed": "true" },
        });
      }),
    );
    await expect(clearResearchSession()).resolves.toBe(true);
    expect(cookie).toBe("");
  });
});
