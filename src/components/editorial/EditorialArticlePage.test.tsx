import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { editorialDefinitions } from "../../editorial/catalog";
import { locales } from "../../lib/i18n";
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
  it.each(locales)("renders the scenario evidence in %s", (locale) => {
    // Given a revised scenario guide.
    const definition = editorialDefinitions.find(
      (entry) => entry.slug === "bull-base-bear-scenario-analysis",
    );
    if (!definition) throw new Error("Missing scenario definition");
    // When the public article renders.
    const { container } = render(
      <EditorialArticlePage locale={locale} definition={definition} />,
    );
    // Then its educational evidence is accessible without client interaction.
    expect(container.querySelectorAll("table tbody tr")).toHaveLength(7);
    expect(
      container.querySelectorAll("table thead th[scope='col']"),
    ).toHaveLength(4);
    expect(
      container.querySelectorAll("a[href^='https://www.sec.gov/']"),
    ).toHaveLength(2);
    expect(
      container.querySelector(`time[datetime='2026-09-17T00:00:00.000Z']`),
    ).not.toBeNull();
    expect(container.querySelector("a[rel='author']")).toHaveAttribute(
      "href",
      locale === "ko" ? "/about" : "/about?lang=en",
    );
  });
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
