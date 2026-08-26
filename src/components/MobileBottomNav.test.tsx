import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MobileBottomNav } from "./MobileBottomNav";

describe("MobileBottomNav", () => {
  it("temporarily hides while a text field owns focus", () => {
    render(
      <>
        <input aria-label="Ticker" />
        <MobileBottomNav activeItem="home" locale="ko" />
      </>,
    );
    const input = screen.getByRole("textbox", { name: "Ticker" });
    const navigation = screen.getByRole("navigation", {
      name: "주요 화면 이동",
    });

    fireEvent.focusIn(input);
    expect(navigation).toHaveAttribute("data-keyboard-open", "true");

    fireEvent.focusOut(input, { relatedTarget: null });
    expect(navigation).not.toHaveAttribute("data-keyboard-open");
  });

  it("preserves Japanese in the research-room destination", () => {
    render(<MobileBottomNav activeItem="home" locale="ja" />);

    expect(
      screen.getByRole("link", { name: /リサーチルーム/u }),
    ).toHaveAttribute("href", "/research-room?lang=ja");
  });
});
