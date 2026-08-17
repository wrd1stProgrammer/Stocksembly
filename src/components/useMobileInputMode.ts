import { useSyncExternalStore } from "react";

const MOBILE_INPUT_QUERY = "(max-width: 768px)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return () => undefined;
  const media = window.matchMedia(MOBILE_INPUT_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function mobileSnapshot(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(MOBILE_INPUT_QUERY).matches
  );
}

function serverSnapshot(): boolean {
  return false;
}

export function useMobileInputMode(): boolean {
  return useSyncExternalStore(subscribe, mobileSnapshot, serverSnapshot);
}
