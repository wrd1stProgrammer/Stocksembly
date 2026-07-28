import ky, { HTTPError, type KyInstance } from "ky";
import type { Locale } from "../../lib/i18n";
import {
  ApiErrorResponseSchema,
  CancelRunResponseSchema,
  type ChildRun,
  ChildRunResponseSchema,
  CreateRunResponseSchema,
  type PublicQuestion,
  PublicQuestionResponseSchema,
  type PublicRunDetail,
  PublicRunDetailSchema,
} from "./schemas";

export class ResearchPayloadError extends Error {
  readonly name = "ResearchPayloadError";
}

export class ResearchRequestError extends Error {
  readonly name = "ResearchRequestError";

  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`Research request failed with ${status}: ${code}`);
  }
}

export class ResearchClientConfigurationError extends Error {
  readonly name = "ResearchClientConfigurationError";
}

type ClientOptions = {
  readonly prefixUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly headers?: HeadersInit;
};

type StartRunInput = {
  readonly symbol: string;
  readonly question: string;
  readonly locale: Locale;
  readonly idempotencyKey: string;
};

type FollowUpInput = {
  readonly reportId: string;
  readonly question?: string;
  readonly idempotencyKey: string;
};

type QuestionInput = {
  readonly reportId: string;
  readonly question: string;
  readonly locale: Locale;
  readonly retryOfQuestionId?: string;
  readonly idempotencyKey: string;
};

export type ResearchClient = {
  readonly bootstrapSession: () => Promise<void>;
  readonly startRun: (input: StartRunInput) => Promise<PublicRunDetail>;
  readonly getRun: (runId: string) => Promise<PublicRunDetail>;
  readonly cancelRun: (runId: string, key: string) => Promise<void>;
  readonly retryRun: (runId: string, key: string) => Promise<ChildRun>;
  readonly followUp: (input: FollowUpInput) => Promise<ChildRun>;
  readonly askQuestion: (input: QuestionInput) => Promise<PublicQuestion>;
  readonly getQuestion: (questionId: string) => Promise<PublicQuestion>;
};

async function payload(response: Response): Promise<unknown> {
  return await response.json();
}

async function requestError(error: HTTPError): Promise<ResearchRequestError> {
  const parsed = ApiErrorResponseSchema.safeParse(
    await payload(error.response),
  );
  return new ResearchRequestError(
    error.response.status,
    parsed.success ? parsed.data.error.code : "RESPONSE_INVALID",
  );
}

async function parsedRequest<T>(
  request: Promise<Response>,
  parse: (input: unknown) => T,
): Promise<T> {
  try {
    return parse(await payload(await request));
  } catch (error) {
    if (error instanceof HTTPError) throw await requestError(error);
    if (error instanceof ResearchRequestError) throw error;
    if (error instanceof Error) {
      throw new ResearchPayloadError(error.message, { cause: error });
    }
    throw error;
  }
}

function command(client: KyInstance, url: URL, key: string, json: unknown) {
  return client.post(url, {
    headers: { "idempotency-key": key },
    json,
  });
}

export function createResearchClient(
  options: ClientOptions = {},
): ResearchClient {
  const baseUrl =
    options.prefixUrl ??
    (typeof window === "undefined" ? undefined : window.location.origin);
  const apiUrl = (path: string) => {
    if (baseUrl === undefined) {
      throw new ResearchClientConfigurationError(
        "A server-side research client requires prefixUrl",
      );
    }
    return new URL(path, baseUrl);
  };
  const client = ky.create({
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.headers === undefined ? {} : { headers: options.headers }),
    credentials: "same-origin",
    retry: { limit: 0 },
    timeout: 15_000,
  });
  const launchClient = client.extend({ timeout: 60_000 });
  return {
    bootstrapSession: async () => {
      await client.get(apiUrl("/api/research/session"));
    },
    async startRun(input) {
      await client.get(apiUrl("/api/research/session"));
      const created = await parsedRequest(
        command(
          launchClient,
          apiUrl("/api/research/runs"),
          input.idempotencyKey,
          {
            symbol: input.symbol,
            question: input.question,
            locale: input.locale,
          },
        ),
        (value) => CreateRunResponseSchema.parse(value),
      );
      return { run: created.run, events: [] };
    },
    getRun: async (runId) =>
      await parsedRequest(
        client.get(apiUrl(`/api/research/runs/${runId}`)),
        (value) => PublicRunDetailSchema.parse(value),
      ),
    cancelRun: async (runId, key) => {
      await parsedRequest(
        command(client, apiUrl(`/api/research/runs/${runId}/cancel`), key, {}),
        (value) => CancelRunResponseSchema.parse(value),
      );
    },
    retryRun: async (runId, key) =>
      (
        await parsedRequest(
          command(
            client,
            apiUrl(`/api/research/runs/${runId}/retries`),
            key,
            {},
          ),
          (value) => ChildRunResponseSchema.parse(value),
        )
      ).run,
    followUp: async (input) =>
      (
        await parsedRequest(
          command(
            client,
            apiUrl(`/api/research/reports/${input.reportId}/follow-ups`),
            input.idempotencyKey,
            input.question === undefined ? {} : { question: input.question },
          ),
          (value) => ChildRunResponseSchema.parse(value),
        )
      ).run,
    askQuestion: async (input) =>
      (
        await parsedRequest(
          command(
            client,
            apiUrl(`/api/research/reports/${input.reportId}/questions`),
            input.idempotencyKey,
            {
              question: input.question,
              locale: input.locale,
              ...(input.retryOfQuestionId === undefined
                ? {}
                : { retryOfQuestionId: input.retryOfQuestionId }),
            },
          ),
          (value) => PublicQuestionResponseSchema.parse(value),
        )
      ).question,
    getQuestion: async (questionId) =>
      (
        await parsedRequest(
          client.get(apiUrl(`/api/research/questions/${questionId}`)),
          (value) => PublicQuestionResponseSchema.parse(value),
        )
      ).question,
  };
}
