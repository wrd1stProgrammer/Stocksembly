// Public ingestion token, not an administrative API credential.
export const posthogToken =
  process.env["NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN"] ??
  "phc_sd57y9rffC5qvnxDscsawMZj9JTWspVq7dnffmYrY7Uj";
export const posthogHost = "https://us.i.posthog.com";
export const posthogEnabled =
  process.env["NEXT_PUBLIC_POSTHOG_ENABLED"] === "true" ||
  (process.env.NODE_ENV === "production" &&
    process.env["NEXT_PUBLIC_POSTHOG_ENABLED"] !== "false");

export function analyticsPath(path: string): string {
  const clean = path.split(/[?#]/)[0] ?? "/";
  return clean
    .replace(/\/[0-9a-f-]{20,}(?=\/|$)/gi, "/:id")
    .replace(/\/(research|research-room|briefing-room)\/.*/, "/$1/:id");
}

export function analyticsUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${analyticsPath(url.pathname)}`;
  } catch {
    return "";
  }
}
