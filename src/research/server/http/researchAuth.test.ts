import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureLocalAuth } from "./localAuth";
import { createResearchAuth } from "./researchAuth";

describe("production research authentication", () => {
  it("requires Cognito for browser sessions while preserving automation bearer access", async () => {
    const local = await ensureLocalAuth(
      await mkdtemp(join(tmpdir(), "stocksembly-cognito-auth-")),
    );
    const auth = createResearchAuth(local, {
      userPoolId: "us-east-1_example",
      clientId: "example-client",
      secureCookie: true,
    });
    const token = await readFile(local.automationTokenPath, "utf8");

    const missing = await auth.bootstrapSessionResponse(
      new Request("https://stocksembly.com/api/research/session"),
    );
    const automation = await auth.authenticate(
      new Request("https://stocksembly.com/api/research/runs", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    const cleared = await auth.bootstrapSessionResponse(
      new Request("https://stocksembly.com/api/research/session", {
        method: "DELETE",
      }),
    );

    expect(missing.status).toBe(401);
    expect(automation.kind).toBe("authenticated");
    expect(cleared.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(cleared.headers.get("set-cookie")).toContain("Secure");
  });
});
