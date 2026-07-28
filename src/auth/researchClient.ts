"use client";

import {
  createResearchClient,
  type ResearchClient,
} from "../research/client/api";
import { currentAccessToken } from "./researchSession";

export function createAuthenticatedResearchClient(): ResearchClient {
  return createResearchClient({ getAccessToken: currentAccessToken });
}
