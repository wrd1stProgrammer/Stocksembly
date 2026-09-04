import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MetaPixel, trackMetaEvent } from "./pixel";

vi.mock("next/script", () => ({
  default: ({ children }: { readonly children: string }) => (
    <script>{children}</script>
  ),
}));

function setConsentCookie(value: "" | "granted"): void {
  // biome-ignore lint/suspicious/noDocumentCookie: the test must exercise the production cookie gate.
  document.cookie = `stocksembly_analytics_consent=${value}; Path=/; ${value === "" ? "Max-Age=0; " : ""}SameSite=Lax`;
}

afterEach(() => {
  cleanup();
  delete window.fbq;
  delete window.stocksemblyFlushMetaEvents;
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

    window.stocksemblyFlushMetaEvents?.();

    expect(fbq).toHaveBeenCalledWith(
      "track",
      "InitiateCheckout",
      { currency: "USD", value: 19 },
      { eventID: "checkout:123" },
    );
    expect(window.stocksemblyFlushMetaEvents).toBeUndefined();
  });

  it("does not retain checkout events without analytics consent", () => {
    trackMetaEvent("InitiateCheckout", { currency: "USD", value: 19 });
    setConsentCookie("granted");
    const fbq = vi.fn();
    window.fbq = fbq;

    window.stocksemblyFlushMetaEvents?.();

    expect(fbq).not.toHaveBeenCalled();
  });

  it("flushes pending events from the inline bootstrap after fbq is created", () => {
    const { container } = render(<MetaPixel pixelId="123" />);

    expect(container.querySelector("script")?.textContent).toContain(
      "window.stocksemblyFlushMetaEvents&&window.stocksemblyFlushMetaEvents()",
    );
  });
});
