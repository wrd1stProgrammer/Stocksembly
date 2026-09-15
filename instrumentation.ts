import type { Instrumentation } from "next";

export async function register() {
  if (process.env["NEXT_RUNTIME"] === "nodejs") {
    const { initializeMonitoring } = await import(
      "./src/lib/observability/server"
    );
    initializeMonitoring("web");
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error) => {
  if (process.env["NEXT_RUNTIME"] === "nodejs" && process.env["SENTRY_DSN"]) {
    const { captureException } = await import("@sentry/node");
    captureException(error);
  }
};
