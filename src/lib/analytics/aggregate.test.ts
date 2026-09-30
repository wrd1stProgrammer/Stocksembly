import { describe, expect, it } from "vitest";
import {
  aggregateSchema,
  aggregateSource,
  allowsAggregate,
  publicSurface,
} from "./aggregate";

describe("unlinked public-page statistics", () => {
  it("excludes private pages and never returns a raw path", () => {
    expect(publicSurface("/en/blog/private-looking-title")).toBe("blog");
    for (const path of [
      "/research/abc",
      "/account",
      "/login",
      "/admin",
      "/checkout",
      "/unknown",
    ])
      expect(publicSurface(path)).toBeUndefined();
  });
  it("limits acquisition to known channel labels", () => {
    expect(aggregateSource("?utm_source=meta&email=private@example.com")).toBe(
      "meta",
    );
    expect(aggregateSource("?utm_source=private@example.com")).toBe("other");
  });
  it("respects rejection, GPC and DNT, and avoids duplicating opted-in analytics", () => {
    expect(allowsAggregate("", false, null)).toBe(true);
    expect(
      allowsAggregate("stocksembly_analytics_consent=denied", false, null),
    ).toBe(false);
    expect(
      allowsAggregate("stocksembly_analytics_consent=granted", false, null),
    ).toBe(false);
    expect(allowsAggregate("", true, null)).toBe(false);
    expect(allowsAggregate("", false, "1")).toBe(false);
  });
  it("rejects additional identifiers or payload text", () => {
    const value = {
      kind: "pageview",
      surface: "landing",
      source: "meta",
      device: "large_screen",
      visibleSeconds: 0,
      scrollDepth: 0,
    };
    expect(aggregateSchema.safeParse(value).success).toBe(true);
    expect(
      aggregateSchema.safeParse({ ...value, userId: "secret" }).success,
    ).toBe(false);
    expect(
      aggregateSchema.safeParse({ ...value, question: "secret" }).success,
    ).toBe(false);
  });
});
