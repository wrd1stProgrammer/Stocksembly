import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("switches the interface language to Korean", () => {
    // Given
    render(createElement(App));

    // When
    fireEvent.click(screen.getByRole("button", { name: "한국어" }));

    // Then
    expect(document.documentElement.lang).toBe("ko");
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
