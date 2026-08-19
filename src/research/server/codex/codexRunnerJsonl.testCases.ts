import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { collectCodexJsonl } from "./codexJsonl";

const VALID_EVENTS = [
  '{"type":"thread.started","thread_id":"safe-id"}\n',
  '{"type":"turn.started"}\n',
  '{"type":"item.completed","item":{"type":"reasoning","text":"discarded"}}\n',
  '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"message\\":\\"PONG\\"}"}}\n',
  '{"type":"turn.completed","usage":{"input_tokens":21003,"cached_input_tokens":0,"cache_write_input_tokens":0,"output_tokens":5,"reasoning_output_tokens":0}}\n',
] as const;

export function registerJsonlTests(): void {
  describe("Codex JSONL boundary", () => {
    it("parses ordered lifecycle events and returns only the final candidate text", () => {
      // Given
      const chunks = VALID_EVENTS.map((event) => Buffer.from(event));

      // When
      const result = collectCodexJsonl(chunks);

      // Then
      expect(result).toEqual({
        eventTypes: [
          "thread.started",
          "turn.started",
          "item.completed",
          "item.completed",
          "turn.completed",
        ],
        finalText: '{"message":"PONG"}',
        searchedUrls: [],
        toolEventCount: 0,
        toolTranscript: [],
        webArtifacts: [],
        tokenUsage: {
          inputTokens: 21_003,
          cachedInputTokens: 0,
          cacheWriteInputTokens: 0,
          outputTokens: 5,
          reasoningOutputTokens: 0,
        },
      });
    });

    it("rejects malformed, interrupted, and out-of-order streams", () => {
      // Given
      const cases = [
        [Buffer.from("not-json\n")],
        VALID_EVENTS.slice(0, 4).map((event) => Buffer.from(event)),
        [Buffer.from('{"type":"turn.started"}\n')],
      ];

      // When / Then
      for (const chunks of cases)
        expect(() => collectCodexJsonl(chunks)).toThrowError(
          expect.objectContaining({ code: "output_invalid" }),
        );
    });

    it("aborts tool events and enforces stdout and payload caps", () => {
      // Given
      const tool = [
        Buffer.from('{"type":"thread.started"}\n'),
        Buffer.from('{"type":"turn.started"}\n'),
        Buffer.from(
          '{"type":"item.started","item":{"type":"command_execution"}}\n',
        ),
      ];

      // When / Then
      expect(() => collectCodexJsonl(tool)).toThrowError(
        expect.objectContaining({ code: "tool_event" }),
      );
      expect(() =>
        collectCodexJsonl([Buffer.alloc(65)], {
          maxStdoutBytes: 64,
          maxPayloadBytes: 64,
        }),
      ).toThrowError(expect.objectContaining({ code: "output_invalid" }));
      expect(() =>
        collectCodexJsonl(
          VALID_EVENTS.map((event) => Buffer.from(event)),
          { maxStdoutBytes: 1_024, maxPayloadBytes: 4 },
        ),
      ).toThrowError(expect.objectContaining({ code: "output_invalid" }));
    });

    it("validates bounded public HTTPS capture records after hosted retrieval", () => {
      // Given
      const content = "bounded public source";
      const contentHash = createHash("sha256").update(content).digest("hex");
      const chunks = [
        Buffer.from('{"type":"thread.started"}\n'),
        Buffer.from('{"type":"turn.started"}\n'),
        Buffer.from(
          '{"type":"item.completed","item":{"type":"web_search","query":"https://example.com/research"}}\n',
        ),
        Buffer.from(
          `${JSON.stringify({
            type: "item.completed",
            item: {
              type: "web_open",
              artifact_id: "00000000-0000-4000-8000-000000000099",
              url: "https://example.com/research",
              title: "Research",
              publisher: "Example",
              retrieved_at: "2026-07-24T09:00:00.000Z",
              excerpt: "bounded public source",
              content,
              content_hash: contentHash,
              redirect_count: 1,
              resolved_ips: ["93.184.216.34"],
            },
          })}\n`,
        ),
        Buffer.from(
          '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"message\\":\\"PONG\\"}"}}\n',
        ),
        Buffer.from('{"type":"turn.completed"}\n'),
      ];

      // When
      const result = collectCodexJsonl(chunks, undefined, "audited_web");

      // Then
      expect(result.toolEventCount).toBe(2);
      expect(result.searchedUrls).toEqual(["https://example.com/research"]);
      expect(result.webArtifacts).toEqual([
        expect.objectContaining({
          artifactId: "00000000-0000-4000-8000-000000000099",
          url: "https://example.com/research",
          contentHash,
        }),
      ]);
      expect(JSON.stringify(result.toolTranscript)).not.toContain(content);
      expect(JSON.stringify(result.toolTranscript)).not.toContain("reasoning");
    });

    it("treats site-qualified web searches as search terms, not source URLs", () => {
      const chunks = [
        Buffer.from('{"type":"thread.started"}\n'),
        Buffer.from('{"type":"turn.started"}\n'),
        Buffer.from(
          '{"type":"item.completed","item":{"type":"web_search","query":"site:news.microsoft.com MSFT latest official news"}}\n',
        ),
        Buffer.from(
          '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"message\\":\\"PONG\\"}"}}\n',
        ),
        Buffer.from('{"type":"turn.completed"}\n'),
      ];

      const result = collectCodexJsonl(chunks, undefined, "audited_web");

      expect(result.toolEventCount).toBe(1);
      expect(result.searchedUrls).toEqual([]);
    });

    it("rejects unsafe or over-limit reported captures and disallowed tool events", () => {
      // Given
      const event = (item: object) => [
        Buffer.from('{"type":"thread.started"}\n'),
        Buffer.from('{"type":"turn.started"}\n'),
        Buffer.from(`${JSON.stringify({ type: "item.completed", item })}\n`),
      ];

      // When / Then
      expect(() =>
        collectCodexJsonl(
          event({ type: "web_search", query: "NVDA" }),
          undefined,
          "disabled",
        ),
      ).toThrowError(expect.objectContaining({ code: "tool_event" }));
      expect(() =>
        collectCodexJsonl(
          event({
            type: "web_open",
            artifact_id: "00000000-0000-4000-8000-000000000099",
            url: "https://127.0.0.1/secret",
            title: "private",
            publisher: "private",
            retrieved_at: "2026-07-24T09:00:00.000Z",
            excerpt: "secret",
            content: "secret",
            content_hash:
              "2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b",
            redirect_count: 0,
            resolved_ips: ["127.0.0.1"],
          }),
          undefined,
          "audited_web",
        ),
      ).toThrowError(expect.objectContaining({ code: "policy_violation" }));
      expect(() =>
        collectCodexJsonl(
          event({ type: "command_execution", command: "env" }),
          undefined,
          "audited_web",
        ),
      ).toThrowError(expect.objectContaining({ code: "tool_event" }));
      expect(() =>
        collectCodexJsonl(
          event({
            type: "web_open",
            artifact_id: "00000000-0000-4000-8000-000000000099",
            url: "https://example.com/large",
            title: "large",
            publisher: "Example",
            retrieved_at: "2026-07-24T09:00:00.000Z",
            excerpt: "large",
            content: "x".repeat(2 * 1_024 * 1_024 + 1),
            content_hash: "0".repeat(64),
            redirect_count: 0,
            resolved_ips: ["93.184.216.34"],
          }),
          { maxStdoutBytes: 30 * 1_024 * 1_024, maxPayloadBytes: 1_024 },
          "audited_web",
        ),
      ).toThrowError(expect.objectContaining({ code: "output_invalid" }));
      expect(() =>
        collectCodexJsonl(
          event({
            type: "web_open",
            artifact_id: "00000000-0000-4000-8000-000000000099",
            url: "https://example.com/redirected",
            title: "redirected",
            publisher: "Example",
            retrieved_at: "2026-07-24T09:00:00.000Z",
            excerpt: "secret",
            content: "secret",
            content_hash:
              "2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b",
            redirect_count: 6,
            resolved_ips: ["93.184.216.34"],
          }),
          undefined,
          "audited_web",
        ),
      ).toThrowError(expect.objectContaining({ code: "policy_violation" }));
      expect(() =>
        collectCodexJsonl(
          [
            Buffer.from('{"type":"thread.started"}\n'),
            Buffer.from('{"type":"turn.started"}\n'),
            ...["open-1", "open-2", "open-3"].map((id) =>
              Buffer.from(
                `${JSON.stringify({
                  type: "item.started",
                  item: { type: "web_open", id },
                })}\n`,
              ),
            ),
          ],
          undefined,
          "audited_web",
        ),
      ).toThrowError(expect.objectContaining({ code: "policy_violation" }));
    });
  });
}
