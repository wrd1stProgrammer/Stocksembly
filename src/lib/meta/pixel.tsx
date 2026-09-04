"use client";

import Script from "next/script";

type MetaEventParameters = Readonly<Record<string, string | number>>;

type MetaPixelFunction = (
  command: "track",
  eventName: "InitiateCheckout" | "PageView",
  parameters?: MetaEventParameters,
  options?: { readonly eventID: string },
) => void;

declare global {
  interface Window {
    fbq?: MetaPixelFunction;
  }
}

export function trackMetaEvent(
  eventName: "InitiateCheckout",
  parameters: MetaEventParameters,
  eventId?: string,
): void {
  if (typeof window === "undefined" || window.fbq === undefined) return;
  window.fbq(
    "track",
    eventName,
    parameters,
    eventId === undefined ? undefined : { eventID: eventId },
  );
}

export function MetaPixel({ pixelId }: { readonly pixelId: string }) {
  return (
    <Script id="stocksembly-meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');fbq('track','PageView');`}
    </Script>
  );
}
