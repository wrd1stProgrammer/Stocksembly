import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { homeMetadataCopy } from "./lib/seo/homeMetadataCopy";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

describe("App", () => {
  it("switches the interface language to Korean", () => {
    // Given
    window.history.replaceState(null, "", "/en?campaign=test#research");
    render(createElement(App));

    // When
    fireEvent.click(screen.getByRole("button", { name: "Language" }));
    fireEvent.click(screen.getByRole("link", { name: /^한국어Korean/u }));

    // Then
    expect(document.documentElement.lang).toBe("ko");
    expect(document.title).toBe(homeMetadataCopy.ko.title);
    expect(navigation.push).toHaveBeenCalledWith("/ko?campaign=test#research");
    expect(
      window.location.pathname + window.location.search + window.location.hash,
    ).toBe("/en?campaign=test#research");
  });

  it("keeps search and social metadata in the selected language", () => {
    window.history.replaceState(null, "", "/ko");
    const tags = [
      ["name", "description"],
      ["property", "og:description"],
      ["name", "twitter:description"],
      ["property", "og:title"],
      ["name", "twitter:title"],
    ].map(([attribute, name]) => {
      const tag = document.createElement("meta");
      tag.setAttribute(attribute ?? "name", name ?? "");
      tag.content = "Stale English metadata";
      document.head.append(tag);
      return tag;
    });
    try {
      render(createElement(App, { initialLocale: "ko" }));
      expect(document.title).toBe(homeMetadataCopy.ko.title);
      for (const tag of tags) {
        const isTitle = (tag.name || tag.getAttribute("property"))?.endsWith(
          ":title",
        );
        expect(tag.content).toBe(
          isTitle ? homeMetadataCopy.ko.title : homeMetadataCopy.ko.description,
        );
      }
    } finally {
      for (const tag of tags) tag.remove();
    }
  });

  it("shows a matching company when a ticker is entered", () => {
    // Given
    render(createElement(App));

    // When
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "MSFT" },
    });

    // Then
    expect(screen.getByText("Microsoft Corporation")).toBeVisible();
  });
});
