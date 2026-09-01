import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingFooter, LandingSections } from "./LandingSections";

const informationPaths = [
  "/about",
  "/methodology",
  "/editorial-policy",
  "/corrections",
  "/contact",
] as const;

describe("landing footer public information links", () => {
  it("links the footer to the matching localized stock-analysis landing page", () => {
    const english = render(<LandingFooter locale="en" />);
    expect(
      english.container.querySelector('a[href="/en/us-stock-analysis"]'),
    ).not.toBeNull();
    english.unmount();

    const korean = render(<LandingFooter locale="ko" />);
    expect(
      korean.container.querySelector('a[href="/ko/us-stock-analysis"]'),
    ).not.toBeNull();
  });

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

  it("uses visible footer section labels as semantic headings", () => {
    render(<LandingFooter locale="en" />);

    expect(
      screen.getByRole("heading", { name: "Product", level: 2 }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "About & standards", level: 2 }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Contact", level: 2 }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Legal", level: 2 }),
    ).toBeVisible();
  });
});

describe("landing explainer", () => {
  it("names the research file deliverable and its three guarantees in English", () => {
    render(<LandingSections locale="en" />);

    expect(
      screen.getByRole("heading", {
        name: "A research file, not a tip.",
        level: 2,
      }),
    ).toBeVisible();
    for (const title of [
      "Sources attached",
      "Disagreement stays visible",
      "Easy mode for beginners",
    ])
      expect(
        screen.getByRole("heading", { name: title, level: 3 }),
      ).toBeVisible();
  });

  it("keeps the same three cards in Korean", () => {
    render(<LandingSections locale="ko" />);

    expect(
      screen.getByRole("heading", {
        name: "추천이 아니라 리서치 파일입니다.",
        level: 2,
      }),
    ).toBeVisible();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
  });
});
