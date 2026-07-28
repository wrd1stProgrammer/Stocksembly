import { describe, expect, it } from "vitest";
import { assertNever } from "./ids";

type Probe = { readonly kind: "alpha" } | { readonly kind: "beta" };

function render(value: Probe): string {
  switch (value.kind) {
    case "alpha":
      return "A";
    case "beta":
      return "B";
    default:
      return assertNever(value);
  }
}

describe("domain exhaustiveness helper", () => {
  it("supports compile-time exhaustive switches", () => {
    expect(render({ kind: "alpha" })).toBe("A");
    expect(render({ kind: "beta" })).toBe("B");
  });
});
