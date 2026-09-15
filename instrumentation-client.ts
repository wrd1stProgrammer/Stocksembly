import * as Sentry from "@sentry/browser";
import { scrubEvent, scrubTransaction } from "./src/lib/observability/privacy";

if (process.env["NEXT_PUBLIC_SENTRY_DSN"]) {
  Sentry.init({
    dsn: process.env["NEXT_PUBLIC_SENTRY_DSN"],
    environment: process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    integrations: (defaults) => [
      ...defaults.filter((item) => item.name !== "Breadcrumbs"),
      Sentry.browserTracingIntegration(),
    ],
    initialScope: { tags: { runtime: "browser" } },
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubTransaction,
  });
}
