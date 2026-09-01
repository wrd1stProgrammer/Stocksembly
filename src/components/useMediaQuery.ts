import { useMemo, useSyncExternalStore } from "react";

export const MOBILE_VIEWPORT_QUERY = "(max-width: 767px)";

function canMatchMedia(): boolean {
  return (
    typeof window !== "undefined" && typeof window.matchMedia === "function"
  );
}

// Reads a media query and re-renders when it flips, for example when a tablet
// rotates. The server snapshot is always false so hydration stays stable.
export function useMediaQuery(query: string): boolean {
  const store = useMemo(
    () => ({
      subscribe(onChange: () => void): () => void {
        if (!canMatchMedia()) return () => undefined;
        const media = window.matchMedia(query);
        media.addEventListener?.("change", onChange);
        return () => media.removeEventListener?.("change", onChange);
      },
      snapshot(): boolean {
        return canMatchMedia() && window.matchMedia(query).matches;
      },
    }),
    [query],
  );
  return useSyncExternalStore(store.subscribe, store.snapshot, () => false);
}

// Phone-width layout: the research room stacks its panels below this width.
export function useIsMobileViewport(): boolean {
  return useMediaQuery(MOBILE_VIEWPORT_QUERY);
}
