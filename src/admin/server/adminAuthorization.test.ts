import { describe, expect, it } from "vitest";
import type { ResearchAuthentication } from "../../research/server/http/researchAuth";
import { authorizeAdmin } from "./adminAuthorization";

function cognito(groups?: readonly string[]): ResearchAuthentication {
  return {
    kind: "authenticated",
    via: "cookie",
    principal: {
      id: "a".repeat(64),
      kind: "cognito",
      subject: "subject",
      ...(groups === undefined ? {} : { groups }),
    },
  };
}

describe("administrator authorization", () => {
  it("allows only the exact admin Cognito group", () => {
    expect(authorizeAdmin(cognito(["admin"]))).toEqual({
      kind: "authorized",
      principalId: "a".repeat(64),
    });
    expect(authorizeAdmin(cognito(["administrator"]))).toEqual({
      kind: "forbidden",
    });
    expect(authorizeAdmin(cognito())).toEqual({ kind: "forbidden" });
  });

  it("rejects unauthenticated and local automation principals", () => {
    expect(authorizeAdmin({ kind: "unauthorized" })).toEqual({
      kind: "unauthenticated",
    });
    expect(
      authorizeAdmin({
        kind: "authenticated",
        via: "bearer",
        principal: { id: "local", kind: "local", groups: ["admin"] },
      }),
    ).toEqual({ kind: "forbidden" });
  });
});
