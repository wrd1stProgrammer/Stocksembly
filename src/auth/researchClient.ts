"use client";

import {
  createResearchClient,
  type ResearchClient,
} from "../research/client/api";
import type { PublicRun } from "../research/client/schemas";
import { currentAuthTokens, syncResearchSession } from "./researchSession";

const pendingLists = new Map<string, Promise<readonly PublicRun[]>>();
let sharedClient: ResearchClient | undefined;

export function createAuthenticatedResearchClient(): ResearchClient {
  if (sharedClient) return sharedClient;
  const client = createResearchClient({ getAuthTokens: currentAuthTokens });
  sharedClient = {
    ...client,
    bootstrapSession: async () => {
      await syncResearchSession();
    },
    listRuns: async (limit = 50) => {
      const tokens = await currentAuthTokens();
      const key = `${tokens.accessToken ?? "anonymous"}:${limit}`;
      const pending = pendingLists.get(key);
      if (pending) return pending;
      const request = (client.listRuns?.(limit) ?? Promise.resolve([])).finally(
        () => pendingLists.delete(key),
      );
      pendingLists.set(key, request);
      return request;
    },
  };
  return sharedClient;
}
