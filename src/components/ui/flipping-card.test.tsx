import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FlippingCard } from "./flipping-card";

describe("FlippingCard activation", () => {
  it("activates an actionable card on the first click", () => {
    const onActivate = vi.fn();
    render(
      <FlippingCard
        ariaLabel="Open NVDA research"
        frontContent={<span>NVDA</span>}
        backContent={<span>Research question</span>}
        onActivate={onActivate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open NVDA research" }));

    expect(onActivate).toHaveBeenCalledOnce();
  });

  it("keeps pinning a presentation-only card without an action", () => {
    render(
      <FlippingCard
        ariaLabel="Preview research"
        frontContent={<span>Front</span>}
        backContent={<span>Back</span>}
      />,
    );
    const card = screen.getByRole("button", { name: "Preview research" });

    fireEvent.click(card);

    expect(card).toHaveAttribute("aria-pressed", "true");
  });
});
