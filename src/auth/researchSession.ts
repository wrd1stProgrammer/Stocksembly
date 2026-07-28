"use client";

import { fetchAuthSession } from "aws-amplify/auth";
import { configureAmplifyAuth } from "./amplifyClient";

export async function currentAccessToken(): Promise<string | undefined> {
  if (!configureAmplifyAuth()) return undefined;
  const session = await fetchAuthSession();
  return session.tokens?.accessToken.toString();
}

export async function syncResearchSession(): Promise<boolean> {
  const token = await currentAccessToken();
  if (token === undefined) return false;
  const response = await fetch("/api/research/session", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { authorization: `Bearer ${token}` },
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
