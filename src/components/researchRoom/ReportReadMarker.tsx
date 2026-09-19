"use client";
import { useEffect } from "react";

/** Mounted only with an authorized, rendered report; prefetching never marks a read. */
export function ReportReadMarker({ reportId }: { reportId: string }) {
  useEffect(() => {
    let sent = false;
    const record = () => {
      if (sent || document.visibilityState !== "visible") return;
      sent = true;
      void fetch(`/api/research-room/${encodeURIComponent(reportId)}/read`, {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
      }).catch(() => undefined);
    };
    record();
    document.addEventListener("visibilitychange", record);
    return () => document.removeEventListener("visibilitychange", record);
  }, [reportId]);
  return null;
}
