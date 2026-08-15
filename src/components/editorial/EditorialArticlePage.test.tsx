import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { editorialDefinitions } from "../../editorial/catalog";
import { EditorialArticlePage } from "./EditorialArticlePage";

vi.mock("next/image", () => ({
  default: (props: { readonly alt: string }) => (
    <span aria-label={props.alt} role="img" />
  ),
}));

vi.mock("../LandingOfficePreview", () => ({
  LandingOfficePreview: (props: { readonly locale: string }) => (
    <section data-locale={props.locale} data-testid="landing-office-preview" />
  ),
}));

vi.mock("../LandingSections", () => ({
  LandingFooter: () => <footer />,
}));

vi.mock("./EditorialCard", () => ({
  EditorialCard: () => <article />,
}));

describe("EditorialArticlePage", () => {
  it("places the localized home office preview between the article CTA and related reading", () => {
    const { container } = render(
      <EditorialArticlePage locale="ko" definition={editorialDefinitions[0]} />,
    );

    const cta = container.querySelector(".editorial-cta");
    const preview = screen.getByTestId("landing-office-preview");
    const related = container.querySelector(".editorial-related");

    expect(cta).not.toBeNull();
    expect(related).not.toBeNull();
    if (!cta || !related)
      throw new Error("Expected article sections to render");
    expect(preview).toHaveAttribute("data-locale", "ko");
    expect(
      cta.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      preview.compareDocumentPosition(related) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
