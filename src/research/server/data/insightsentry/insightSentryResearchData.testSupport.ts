import type {
  InsightSentryClient,
  InsightSentryRequest,
  InsightSentryResult,
} from "./insightSentryClient";
import type {
  InsightSentryResearchRollout,
  NewsClassifierRequest,
} from "./insightSentryResearchContracts";

export const AS_OF = "2026-07-24T12:00:00.000Z";
export const ROLLOUT: InsightSentryResearchRollout = {
  fundamentals: true,
  news: true,
  documents: true,
  calendar: true,
  peers: true,
  options: true,
};

export type CapturedRequest = {
  readonly endpoint: string;
  readonly parameters: Readonly<
    Record<string, string | number | boolean | readonly string[]>
  >;
};

export function fixtureClient(
  fixtures: Readonly<Record<string, unknown>>,
  requests: CapturedRequest[],
): InsightSentryClient {
  return {
    get: async <T>(
      request: InsightSentryRequest<T>,
    ): Promise<InsightSentryResult<T>> => {
      requests.push({
        endpoint: request.endpoint,
        parameters: request.parameters,
      });
      const key = `${request.endpoint}:${String(request.parameters["from"] ?? "")}:${String(request.parameters["next_token"] ?? "")}`;
      const data = fixtures[key] ?? fixtures[request.endpoint];
      return {
        data: request.schema.parse(data),
        cacheKey: key,
        cacheStatus: "miss",
        retrievedAt: AS_OF,
        responseBytes: 100,
      };
    },
  };
}

export function classifier(
  calls: NewsClassifierRequest[],
  material: boolean,
): (request: NewsClassifierRequest) => Promise<unknown> {
  return async (request) => {
    calls.push(request);
    return {
      classifications: request.candidates.map((candidate, index) => ({
        candidateId: candidate.candidateId,
        eventKey: index < 2 ? "guidance" : `event-${index}`,
        category: index % 2 === 0 ? "company" : "risk",
        relevance: 0.9,
        materiality: material ? "material" : "immaterial",
        novelty: "unique",
        direction: index === 0 ? "positive" : "negative",
        horizon: "near_term",
        verificationNeed: "recommended",
      })),
    };
  };
}
