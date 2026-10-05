import { expect, it } from "vitest";
import { safeDestination } from "./safeDestination";

it("preserves internal destinations and rejects browser URL normalization escapes", () => {
  expect(safeDestination("/research-room/123?locale=ko#chart")).toBe(
    "/research-room/123?locale=ko#chart",
  );
  for (const value of [
    null,
    "//evil.test",
    "/\\evil.test",
    "/\t/evil.test",
    "/%5cevil.test",
    "https://evil.test",
    "javascript:alert(1)",
    "/..//evil.test",
  ])
    expect(safeDestination(value)).toBe("/");
});
