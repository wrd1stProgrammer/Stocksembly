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
    stocksemblyFlushMetaEvents?: () => void;
  }
}

type PendingMetaEvent = {
  readonly eventName: "InitiateCheckout";
  readonly parameters: MetaEventParameters;
  readonly eventId?: string;
};

const pendingMetaEvents: PendingMetaEvent[] = [];

function hasAnalyticsConsent(): boolean {
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .includes("stocksembly_analytics_consent=granted");
}

function sendMetaEvent(event: PendingMetaEvent): void {
  window.fbq?.(
    "track",
    event.eventName,
    event.parameters,
    event.eventId === undefined ? undefined : { eventID: event.eventId },
  );
}

function flushPendingMetaEvents(): void {
  if (typeof window === "undefined") return;
  if (!hasAnalyticsConsent()) {
    pendingMetaEvents.length = 0;
    delete window.stocksemblyFlushMetaEvents;
    return;
  }
  if (window.fbq === undefined) return;
  for (const event of pendingMetaEvents.splice(0)) sendMetaEvent(event);
  delete window.stocksemblyFlushMetaEvents;
}

export function trackMetaEvent(
  eventName: "InitiateCheckout",
  parameters: MetaEventParameters,
  eventId?: string,
): void {
  if (typeof window === "undefined") return;
  if (!hasAnalyticsConsent()) {
    pendingMetaEvents.length = 0;
    delete window.stocksemblyFlushMetaEvents;
    return;
  }
  const event: PendingMetaEvent = {
    eventName,
    parameters,
    ...(eventId === undefined ? {} : { eventId }),
  };
  if (window.fbq === undefined) {
    pendingMetaEvents.push(event);
    window.stocksemblyFlushMetaEvents = flushPendingMetaEvents;
    return;
  }
  sendMetaEvent(event);
}

export function MetaPixel({ pixelId }: { readonly pixelId: string }) {
  return (
    <Script id="stocksembly-meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');fbq('track','PageView');window.stocksemblyFlushMetaEvents&&window.stocksemblyFlushMetaEvents();`}
    </Script>
  );
}
