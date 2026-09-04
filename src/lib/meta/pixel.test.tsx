import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MetaPixel, trackMetaEvent } from "./pixel";

vi.mock("next/script", () => ({
  default: ({
    children,
    onReady,
  }: {
    readonly children: string;
    readonly onReady?: () => void;
  }) => {
    onReady?.();
    return <script>{children}</script>;
  },
}));

function setConsentCookie(value: "" | "granted"): void {
  // biome-ignore lint/suspicious/noDocumentCookie: the test must exercise the production cookie gate.
  document.cookie = `stocksembly_analytics_consent=${value}; Path=/; ${value === "" ? "Max-Age=0; " : ""}SameSite=Lax`;
}

afterEach(() => {
  cleanup();
  delete window.fbq;
  setConsentCookie("");
});

describe("Meta Pixel event delivery", () => {
  it("queues consented checkout events until the Pixel is ready", () => {
    setConsentCookie("granted");

    trackMetaEvent(
      "InitiateCheckout",
      { currency: "USD", value: 19 },
      "checkout:123",
    );
    const fbq = vi.fn();
    window.fbq = fbq;

    render(<MetaPixel pixelId="123" />);

    expect(fbq).toHaveBeenCalledWith(
      "track",
      "InitiateCheckout",
      { currency: "USD", value: 19 },
      { eventID: "checkout:123" },
    );
  });

  it("does not retain checkout events without analytics consent", () => {
    trackMetaEvent("InitiateCheckout", { currency: "USD", value: 19 });
    setConsentCookie("granted");
    const fbq = vi.fn();
    window.fbq = fbq;

    render(<MetaPixel pixelId="123" />);

    expect(fbq).not.toHaveBeenCalled();
  });
});
