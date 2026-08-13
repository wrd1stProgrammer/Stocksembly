import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/App", () => ({ App: () => null }));

import { metadata } from "./page";

describe("homepage metadata", () => {
  it("declares the apex homepage as canonical", () => {
    expect(metadata.alternates).toEqual({ canonical: "/" });
  });
});
