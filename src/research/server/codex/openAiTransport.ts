import { z } from "zod";
import { CodexRunnerError } from "./codexErrors";
import { openAiApiKey } from "./openAiCredentials";

const OutputSchema = z.object({
  id: z.string(),
  status: z.literal("completed"),
  output: z.array(
    z
      .object({
        type: z.string(),
        status: z.string().optional(),
        action: z
          .object({
            sources: z.array(z.object({ url: z.string() })).optional(),
          })
          .passthrough()
          .optional(),
        content: z
          .array(
            z.object({
              type: z.string(),
              text: z.string().optional(),
              annotations: z
                .array(
                  z
                    .object({ type: z.string(), url: z.string().optional() })
                    .passthrough(),
                )
                .optional(),
            }),
          )
          .optional(),
      })
      .passthrough(),
  ),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
      input_tokens_details: z
        .object({ cached_tokens: z.number().int().nonnegative() })
        .optional(),
      output_tokens_details: z
        .object({ reasoning_tokens: z.number().int().nonnegative() })
        .optional(),
    })
    .optional(),
});

export async function requestOpenAiResponse(
  body: Record<string, unknown>,
  options: {
    signal?: AbortSignal;
    onActivity?: () => void;
    fetch?: typeof fetch;
    apiKey?: () => Promise<string>;
  } = {},
) {
  const timeout = AbortSignal.timeout(600_000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  try {
    const response = await (options.fetch ?? fetch)(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        redirect: "error",
        signal,
        headers: {
          authorization: `Bearer ${await (options.apiKey ?? openAiApiKey)()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ ...body, store: false, stream: true }),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new CodexRunnerError(
        response.status === 429
          ? "rate_limited"
          : response.status === 401 || response.status === 403
            ? "auth_unavailable"
            : response.status >= 500
              ? "network_unavailable"
              : "schema_invalid",
      );
    }
    if (!response.body) throw new CodexRunnerError("output_invalid");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let bytes = 0;
    let completed: unknown;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 8 * 1024 * 1024)
          throw new CodexRunnerError("output_invalid");
        options.onActivity?.();
        pending += decoder.decode(chunk.value, { stream: true });
        while (pending.includes("\n")) {
          const newline = pending.indexOf("\n");
          const line = pending.slice(0, newline).trimEnd();
          pending = pending.slice(newline + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") continue;
          const event = z
            .object({ type: z.string(), response: z.unknown().optional() })
            .parse(JSON.parse(data));
          if (event.type === "response.completed") completed = event.response;
          if (event.type === "response.failed" || event.type === "error")
            throw new CodexRunnerError("process_failed");
          if (event.type === "response.incomplete")
            throw new CodexRunnerError("output_invalid");
        }
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    const result = OutputSchema.safeParse(completed);
    if (!result.success) throw new CodexRunnerError("output_invalid");
    return result.data;
  } catch (error) {
    if (options.signal?.aborted) throw new CodexRunnerError("cancelled");
    if (timeout.aborted) throw new CodexRunnerError("timeout");
    if (error instanceof CodexRunnerError) throw error;
    if (error instanceof SyntaxError || error instanceof z.ZodError)
      throw new CodexRunnerError("output_invalid");
    throw new CodexRunnerError("network_unavailable");
  }
}
