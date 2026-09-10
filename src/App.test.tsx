import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
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
    expect(navigation.push).toHaveBeenCalledWith("/ko?campaign=test#research");
    expect(
      window.location.pathname + window.location.search + window.location.hash,
    ).toBe("/en?campaign=test#research");
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
