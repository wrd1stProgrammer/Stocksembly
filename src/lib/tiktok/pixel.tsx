"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect } from "react";

export function TikTokPixel({ pixelId }: { readonly pixelId: string }) {
  const pathname = usePathname();
  useEffect(() => {
    const clickId = new URL(window.location.href).searchParams.get("ttclid");
    if (clickId && /^[A-Za-z0-9._~-]{1,512}$/u.test(clickId)) {
      document.cookie = `stocksembly_ttclid=${clickId}; Path=/; Max-Age=604800; SameSite=Lax; Secure`;
    }
  }, []);
  if (!/^[A-Z0-9]{20}$/u.test(pixelId) || !["/", "/pricing"].includes(pathname))
    return null;
  return (
    <Script id="stocksembly-tiktok-pixel" strategy="afterInteractive">{`
!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];
ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};n=d.createElement("script");n.type="text/javascript";n.async=!0;n.src=r+"?sdkid="+e+"&lib="+t;e=d.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
ttq.load('${pixelId}');
if(location.pathname==='/'||location.pathname==='/pricing')ttq.page({url:location.origin+location.pathname});
}(window,document,'ttq');
`}</Script>
  );
}
