"use client";

import { fetchAuthSession } from "aws-amplify/auth";
import { configureAmplifyAuth } from "./amplifyClient";

export type CurrentAuthTokens = {
  readonly accessToken?: string;
  readonly identityToken?: string;
};

const AUTH_SESSION_RETRY_DELAYS_MS = [0, 150, 400, 800] as const;

async function wait(delayMs: number): Promise<void> {
  if (delayMs === 0) return;
  await new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

export async function currentAuthTokens(): Promise<CurrentAuthTokens> {
  if (!configureAmplifyAuth()) return {};
  for (const delayMs of AUTH_SESSION_RETRY_DELAYS_MS) {
    await wait(delayMs);
    try {
      const session = await fetchAuthSession();
      const accessToken = session.tokens?.accessToken?.toString();
      const identityToken = session.tokens?.idToken?.toString();
      if (accessToken !== undefined || identityToken !== undefined) {
        return {
          ...(accessToken === undefined ? {} : { accessToken }),
          ...(identityToken === undefined ? {} : { identityToken }),
        };
      }
    } catch {
      // Cognito may still be restoring its browser session after sign-in.
    }
  }
  return {};
}

export async function syncResearchSession(): Promise<boolean> {
  const tokens = await currentAuthTokens();
  if (tokens.accessToken === undefined) return false;
  const response = await fetch("/api/research/session", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      authorization: `Bearer ${tokens.accessToken}`,
      ...(tokens.identityToken
        ? { "x-stocksembly-identity-token": tokens.identityToken }
        : {}),
    },
  });
  if (!response.ok) throw new Error("RESEARCH_SESSION_SYNC_FAILED");
  return response.headers.get("x-stocksembly-session-changed") === "true";
}

export async function clearResearchSession(): Promise<boolean> {
  const response = await fetch("/api/research/session", {
    method: "DELETE",
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("RESEARCH_SESSION_CLEAR_FAILED");
  return response.headers.get("x-stocksembly-session-changed") === "true";
}
