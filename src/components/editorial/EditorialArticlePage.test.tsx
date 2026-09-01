import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { editorialDefinitions } from "../../editorial/catalog";
import { EditorialArticlePage } from "./EditorialArticlePage";

vi.mock("next/image", () => ({
  default: (props: { readonly alt: string }) => (
    <span aria-label={props.alt} role="img" />
  ),
}));

vi.mock("../LandingSections", () => ({
  LandingFooter: () => <footer />,
}));

vi.mock("./EditorialCard", () => ({
  EditorialCard: () => <article />,
}));

describe("EditorialArticlePage", () => {
  it("keeps the article CTA ahead of related reading without a live office embed", () => {
    const { container } = render(
      <EditorialArticlePage locale="ko" definition={editorialDefinitions[0]} />,
    );

    const cta = container.querySelector(".editorial-cta");
    const related = container.querySelector(".editorial-related");

    expect(cta).not.toBeNull();
    expect(related).not.toBeNull();
    if (!cta || !related)
      throw new Error("Expected article sections to render");
    // The oversized live office used to sit here; the text CTA is the only handoff now.
    expect(container.querySelector(".landing-office-live")).toBeNull();
    expect(container.querySelectorAll("canvas")).toHaveLength(0);
    expect(cta.querySelector("a")).toHaveAttribute("href", "/ko#product");
    expect(
      cta.compareDocumentPosition(related) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
