export const REDUCED_MOTION_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";

// Reads the viewer's reduced-motion preference once, safely on the server and
// in test environments without `matchMedia`.
export function prefersReducedMotion(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia(REDUCED_MOTION_MEDIA_QUERY).matches;
}
