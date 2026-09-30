import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TRUSTED_AGENT_RUNTIME_POLICY } from "../../application/commitAgentOutputContracts";
import { SemanticAuditModelOutputSchema } from "../../workflow/semanticAuditContracts";
import { researchExecutionCapacity } from "../persistence/postgres/runExecutionRepository";
import {
  createCodexPort,
  runProductionCodexWorkerAdmission,
} from "./codexRunner";
import { committedReservation, runInput } from "./codexRunnerPortTestSupport";
import { createOpenAiPort } from "./openAiResponsesRunner";
import { requestOpenAiResponse } from "./openAiTransport";
import { OPENAI_RUNNER_HASH } from "./researchProvider";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const completed = {
  id: "resp-test",
  status: "completed" as const,
  output: [
    {
      type: "message",
      content: [{ type: "output_text", text: '{"message":"PONG"}' }],
    },
  ],
  usage: {
    input_tokens: 10,
    output_tokens: 5,
    input_tokens_details: { cached_tokens: 3 },
    output_tokens_details: { reasoning_tokens: 2 },
  },
};

function streamResponse(value: unknown) {
  return new Response(
    `data: ${JSON.stringify({ type: "response.completed", response: value })}\n\n`,
    { headers: { "content-type": "text/event-stream" } },
  );
}

describe("direct OpenAI research", () => {
  it("recovers an invented question ID before strict audit validation and records actual runner evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "openai-audit-"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const claimId = "11111111-1111-4111-8111-111111111111";
      const verdict = {
        claimId,
        verdict: "entailed",
        contradictionSeverity: "none",
        publicExplanation: { en: "Supported.", ko: "근거가 있습니다." },
      };
      const input = {
        ...runInput(directory),
        stage: "semantic_audit" as const,
        prompt: JSON.stringify({
          kind: "semantic_audit_input_v1",
          claims: [{ claimId }],
          questions: [],
        }),
        outputSchema: SemanticAuditModelOutputSchema,
      };
      const port = createOpenAiPort(
        { readCommittedReservation: async () => committedReservation(input) },
        async () => ({
          ...completed,
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    kind: "semantic_audit",
                    verdicts: [verdict],
                    questionCoverage: [
                      {
                        questionId: "q1",
                        status: "covered",
                        claimIds: [claimId],
                      },
                    ],
                  }),
                },
              ],
            },
          ],
        }),
      );
      const result = await port.run(input);
      expect(result.candidate.verdicts).toEqual([verdict]);
      expect(result.candidate.questionCoverage).toEqual([]);
      expect(result.evidence.model).toBe("gpt-6-luna");
      expect(
        warn.mock.calls.map(([line]) => JSON.parse(String(line)).kind),
      ).toContain("model_output_contract_recovered");
    } finally {
      warn.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("selects only API capacity and bypasses Codex admission and binary checks", async () => {
    vi.stubEnv("STOCKSEMBLY_RESEARCH_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "fixture-key");
    vi.stubEnv("STOCKSEMBLY_CODEX_API_ENABLED", "0");
    expect(
      createCodexPort({ readCommittedReservation: async () => undefined }).id,
    ).toBe("openai-responses");
    expect(researchExecutionCapacity()).toEqual({
      subscription: 0,
      api: 6,
      total: 6,
    });
    expect(TRUSTED_AGENT_RUNTIME_POLICY.model).toBe("gpt-6-luna");
    expect(TRUSTED_AGENT_RUNTIME_POLICY.cliBinaryHash).toBe(OPENAI_RUNNER_HASH);
    await expect(runProductionCodexWorkerAdmission()).resolves.toBeUndefined();
  });

  it("validates reservations, calls Luna, persists truthful API evidence and tokens", async () => {
    const directory = await mkdtemp(join(tmpdir(), "openai-test-"));
    try {
      const input = runInput(directory);
      const transport = vi.fn(async () => completed);
      const port = createOpenAiPort(
        { readCommittedReservation: async () => committedReservation(input) },
        transport,
      );
      const result = await port.run(input);
      expect(result.candidate).toEqual({ message: "PONG" });
      expect(transport).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-6-luna",
          reasoning: { effort: "low" },
        }),
        expect.anything(),
      );
      expect(result.evidence).toMatchObject({
        executionBackend: "api",
        binaryVersion: "openai-responses-v1",
        model: "gpt-6-luna",
        tokenUsage: {
          inputTokens: 10,
          cachedInputTokens: 3,
          outputTokens: 5,
          reasoningOutputTokens: 2,
        },
      });
      expect(
        JSON.parse(await readFile(join(directory, "lifecycle.json"), "utf8")),
      ).toMatchObject({ responseId: "resp-test" });
      const invalid = createOpenAiPort(
        { readCommittedReservation: async () => undefined },
        transport,
      );
      await expect(invalid.run(input)).rejects.toMatchObject({
        code: "policy_violation",
      });
      expect(transport).toHaveBeenCalledTimes(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("streams activity and sends credentials only to OpenAI with storage disabled", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => streamResponse(completed));
    const activity = vi.fn();
    expect(
      await requestOpenAiResponse(
        { model: "gpt-6-luna" },
        {
          fetch: fetcher,
          apiKey: async () => "fixture-key",
          onActivity: activity,
        },
      ),
    ).toEqual(completed);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        redirect: "error",
        body: JSON.stringify({
          model: "gpt-6-luna",
          store: false,
          stream: true,
        }),
      }),
    );
    expect(activity).toHaveBeenCalled();
  });

  it.each([
    [401, "auth_unavailable"],
    [429, "rate_limited"],
    [503, "network_unavailable"],
    [400, "schema_invalid"],
  ])(
    "classifies HTTP %s without retries or subscription fallback",
    async (status, code) => {
      const fetcher = vi.fn<typeof fetch>(
        async () =>
          new Response("private provider message", { status: Number(status) }),
      );
      await expect(
        requestOpenAiResponse(
          {},
          { fetch: fetcher, apiKey: async () => "fixture-key" },
        ),
      ).rejects.toMatchObject({ code });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects incomplete responses and propagates cancellation", async () => {
    await expect(
      requestOpenAiResponse(
        {},
        {
          fetch: async () =>
            streamResponse({ ...completed, status: "incomplete" }),
          apiKey: async () => "fixture-key",
        },
      ),
    ).rejects.toMatchObject({ code: "output_invalid" });
    await expect(
      requestOpenAiResponse(
        {},
        {
          signal: AbortSignal.abort(),
          fetch: async () => {
            throw new Error("cancelled");
          },
          apiKey: async () => "fixture-key",
        },
      ),
    ).rejects.toMatchObject({ code: "cancelled" });
  });
});
