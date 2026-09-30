import { describe, expect, it } from "vitest";
import { analyticsPath, analyticsUrl } from "./config";

describe("analytics privacy", () => {
  it("drops queries, fragments and research identifiers", () => {
    expect(
      analyticsUrl(
        "https://stocksembly.com/login?email=private@example.com#token",
      ),
    ).toBe("https://stocksembly.com/login");
    expect(analyticsPath("/research/private-report?question=secret")).toBe(
      "/research/:id",
    );
    expect(analyticsUrl("not a url")).toBe("");
  });
});
