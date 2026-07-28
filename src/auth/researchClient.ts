"use client";

import {
  createResearchClient,
  type ResearchClient,
} from "../research/client/api";
import { currentAuthTokens } from "./researchSession";

export function createAuthenticatedResearchClient(): ResearchClient {
  return createResearchClient({ getAuthTokens: currentAuthTokens });
}
