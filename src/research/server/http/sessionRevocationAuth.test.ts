import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { ensureLocalAuth } from "./localAuth";
import { createResearchAuth } from "./researchAuth";

vi.mock("aws-jwt-verify", () => ({
  CognitoJwtVerifier: {
    create: () => ({
      verify: async () => ({
        sub: "user",
        origin_jti: "session-family",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    }),
  },
}));
it("rejects a logged-out family on cookie, bearer and session bootstrap", async () => {
  const revoked = new Set<string>();
  const auth = createResearchAuth(
    await ensureLocalAuth(await mkdtemp(join(tmpdir(), "revocation-"))),
    {
      userPoolId: "pool",
      clientId: "client",
      secureCookie: true,
      sessions: {
        isRevoked: async (key) => revoked.has(key),
        revoke: async (key) => {
          revoked.add(key);
        },
      },
    },
  );
  const request = (method = "GET") =>
    new Request("https://stocksembly.com/api/research/session", {
      method,
      headers: {
        authorization: "Bearer access-token",
        cookie: "stocksembly_cognito_session=access-token",
      },
    });
  expect((await auth.authenticate(request())).kind).toBe("authenticated");
  expect((await auth.bootstrapSessionResponse(request("DELETE"))).status).toBe(
    204,
  );
  expect((await auth.authenticate(request())).kind).toBe("unauthorized");
  expect((await auth.bootstrapSessionResponse(request())).status).toBe(401);
  expect(
    (
      await auth.authenticate(
        new Request("https://stocksembly.com", {
          headers: { cookie: "stocksembly_cognito_session=refreshed-token" },
        }),
      )
    ).kind,
  ).toBe("unauthorized");
});
