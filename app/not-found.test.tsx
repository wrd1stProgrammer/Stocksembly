import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound from "./not-found";

describe("agent-friendly not found page", () => {
  it("offers recovery links without changing the real 404 route behavior", () => {
    const { container } = render(<NotFound />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Page not found",
    );
    for (const href of [
      "/",
      "/research-room",
      "/sitemap.xml",
      "/llms.txt",
      "/contact",
    ]) {
      expect(container.querySelector(`a[href="${href}"]`)).not.toBeNull();
    }
  });
});
