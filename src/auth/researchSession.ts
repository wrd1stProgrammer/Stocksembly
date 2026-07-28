"use client";

import { fetchAuthSession } from "aws-amplify/auth";
import { configureAmplifyAuth } from "./amplifyClient";

export type CurrentAuthTokens = {
  readonly accessToken?: string;
  readonly identityToken?: string;
};

export async function currentAuthTokens(): Promise<CurrentAuthTokens> {
  if (!configureAmplifyAuth()) return {};
  const session = await fetchAuthSession();
  return {
    ...(session.tokens?.accessToken
      ? { accessToken: session.tokens.accessToken.toString() }
      : {}),
    ...(session.tokens?.idToken
      ? { identityToken: session.tokens.idToken.toString() }
      : {}),
  };
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

export async function clearResearchSession(): Promise<void> {
  await fetch("/api/research/session", {
    method: "DELETE",
    credentials: "same-origin",
    cache: "no-store",
  });
}
