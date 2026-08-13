import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingFooter } from "./LandingSections";

const informationPaths = [
  "/about",
  "/methodology",
  "/editorial-policy",
  "/corrections",
] as const;

describe("landing footer public information links", () => {
  it("links the English footer to the English public information pages", () => {
    const { container } = render(<LandingFooter locale="en" />);

    for (const path of informationPaths)
      expect(
        container.querySelector(`a[href="${path}?lang=en"]`),
      ).not.toBeNull();
  });

  it("links the Korean footer to the canonical public information pages", () => {
    const { container } = render(<LandingFooter locale="ko" />);

    for (const path of informationPaths)
      expect(container.querySelector(`a[href="${path}"]`)).not.toBeNull();
  });
});
