import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import { CodexRunnerError } from "./codexErrors";
import { CODEX_RUNTIME_POLICY, type CodexBrowsingPolicy } from "./codexPolicy";
import type { CapturedWebArtifact } from "./codexTypes";

const EventSchema = z.object({
  type: z.string(),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative(),
      cached_input_tokens: z.number().int().nonnegative(),
      cache_write_input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
      reasoning_output_tokens: z.number().int().nonnegative(),
    })
    .optional(),
  item: z
    .object({
      type: z.string(),
      id: z.string().min(1).max(256).optional(),
      text: z.string().optional(),
      query: z.string().max(4_096).optional(),
      artifact_id: z.string().uuid().optional(),
      url: z.string().max(8_192).optional(),
      title: z.string().max(1_024).optional(),
      publisher: z.string().max(512).optional(),
      retrieved_at: z.string().datetime().optional(),
      excerpt: z.string().max(8_192).optional(),
      content: z.string().optional(),
      content_hash: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
      redirect_count: z.number().int().nonnegative().optional(),
      resolved_ips: z.array(z.string().max(64)).max(16).optional(),
    })
    .optional(),
});

type JsonlCaps = {
  readonly maxStdoutBytes: number;
  readonly maxPayloadBytes: number;
};

type SanitizedToolEvent =
  | { readonly type: "web_search" }
  | {
      readonly type: "web_open";
      readonly artifactId: string;
      readonly url: string;
      readonly contentHash: string;
    };

export type CollectedCodexJsonl = {
  readonly eventTypes: readonly string[];
  readonly finalText: string;
  readonly searchedUrls: readonly string[];
  readonly toolEventCount: number;
  readonly toolTranscript: readonly SanitizedToolEvent[];
  readonly webArtifacts: readonly CapturedWebArtifact[];
  readonly tokenUsage?: CodexTokenUsage;
};

export type CodexTokenUsage = {
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly cacheWriteInputTokens: number;
  readonly outputTokens: number;
  readonly reasoningOutputTokens: number;
};

const LIFECYCLE_EVENTS = new Set([
  "thread.started",
  "turn.started",
  "turn.completed",
]);
const ITEM_EVENTS = new Set(["item.started", "item.updated", "item.completed"]);
const SAFE_ITEM_TYPES = new Set(["agent_message", "error", "reasoning"]);
const WEB_ITEM_TYPES = new Set(["web_search", "web_open"]);

function privateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map((octet) => Number(octet));
  const first = octets[0] ?? -1;
  const second = octets[1] ?? -1;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
}

function assertCapturedPublicHttps(rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new CodexRunnerError("policy_violation");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const ipVersion = isIP(hostname);
  if (
    url.protocol !== "https:" ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    (ipVersion === 4 && privateIpv4(hostname)) ||
    (ipVersion === 6 &&
      (hostname === "::1" ||
        hostname === "::" ||
        hostname.startsWith("fc") ||
        hostname.startsWith("fd") ||
        /^fe[89ab]/.test(hostname) ||
        hostname.startsWith("::ffff:")))
  )
    throw new CodexRunnerError("policy_violation");
}

function capturedWebArtifact(
  item: z.infer<typeof EventSchema>["item"],
): CapturedWebArtifact {
  if (
    item?.artifact_id === undefined ||
    item.url === undefined ||
    item.title === undefined ||
    item.publisher === undefined ||
    item.retrieved_at === undefined ||
    item.excerpt === undefined ||
    item.content === undefined ||
    item.content_hash === undefined ||
    item.redirect_count === undefined ||
    item.resolved_ips === undefined ||
    item.resolved_ips.length === 0
  )
    throw new CodexRunnerError("output_invalid");
  assertCapturedPublicHttps(item.url);
  if (item.redirect_count > CODEX_RUNTIME_POLICY.maxReportedWebRedirects)
    throw new CodexRunnerError("policy_violation");
  for (const address of item.resolved_ips) {
    const version = isIP(address);
    if (
      version === 0 ||
      (version === 4 && privateIpv4(address)) ||
      (version === 6 &&
        (address === "::1" ||
          address === "::" ||
          address.startsWith("fc") ||
          address.startsWith("fd") ||
          /^fe[89ab]/.test(address) ||
          address.startsWith("::ffff:")))
    )
      throw new CodexRunnerError("policy_violation");
  }
  const content = Buffer.from(item.content, "utf8");
  if (
    content.byteLength === 0 ||
    content.byteLength > CODEX_RUNTIME_POLICY.maxCapturedWebArtifactBytes ||
    createHash("sha256").update(content).digest("hex") !== item.content_hash
  )
    throw new CodexRunnerError("output_invalid");
  return Object.freeze({
    artifactId: item.artifact_id,
    url: item.url,
    title: item.title,
    publisher: item.publisher,
    retrievedAt: item.retrieved_at,
    excerpt: item.excerpt,
    contentHash: item.content_hash,
    content,
  });
}

function assertAllowedItem(
  itemType: string,
  browsingPolicy: CodexBrowsingPolicy,
): void {
  if (SAFE_ITEM_TYPES.has(itemType)) return;
  if (browsingPolicy === "audited_web" && WEB_ITEM_TYPES.has(itemType)) return;
  throw new CodexRunnerError("tool_event");
}

export class CodexJsonlEarlyGuard {
  private remainder = "";
  private totalBytes = 0;

  constructor(
    private readonly browsingPolicy: CodexBrowsingPolicy = "disabled",
  ) {}

  feed(chunk: Uint8Array): void {
    this.totalBytes += chunk.byteLength;
    this.remainder += Buffer.from(chunk).toString("utf8");
    if (
      this.totalBytes >
      (this.browsingPolicy === "audited_web"
        ? CODEX_RUNTIME_POLICY.maxAuditedStdoutBytes
        : CODEX_RUNTIME_POLICY.maxStdoutBytes)
    )
      throw new CodexRunnerError("output_invalid");
    const lines = this.remainder.split("\n");
    this.remainder = lines.pop() ?? "";
    for (const line of lines) {
      if (line.length === 0) continue;
      let decoded: unknown;
      try {
        decoded = JSON.parse(line);
      } catch {
        throw new CodexRunnerError("output_invalid");
      }
      const parsed = EventSchema.safeParse(decoded);
      if (!parsed.success) throw new CodexRunnerError("output_invalid");
      if (ITEM_EVENTS.has(parsed.data.type) && parsed.data.item !== undefined) {
        assertAllowedItem(parsed.data.item.type, this.browsingPolicy);
        if (
          parsed.data.type === "item.completed" &&
          parsed.data.item.type === "web_open"
        )
          capturedWebArtifact(parsed.data.item);
      }
    }
  }
}

export function collectCodexJsonl(
  chunks: readonly Uint8Array[],
  caps: JsonlCaps | undefined = undefined,
  browsingPolicy: CodexBrowsingPolicy = "disabled",
): CollectedCodexJsonl {
  const appliedCaps = caps ?? {
    maxStdoutBytes:
      browsingPolicy === "audited_web"
        ? CODEX_RUNTIME_POLICY.maxAuditedStdoutBytes
        : CODEX_RUNTIME_POLICY.maxStdoutBytes,
    maxPayloadBytes: CODEX_RUNTIME_POLICY.maxPayloadBytes,
  };
  const byteLength = chunks.reduce(
    (total, chunk) => total + chunk.byteLength,
    0,
  );
  if (byteLength === 0 || byteLength > appliedCaps.maxStdoutBytes)
    throw new CodexRunnerError("output_invalid");
  const lines = Buffer.concat(chunks, byteLength)
    .toString("utf8")
    .split("\n")
    .filter((line) => line.length > 0);
  const eventTypes: string[] = [];
  const toolTranscript: SanitizedToolEvent[] = [];
  const webArtifacts: CapturedWebArtifact[] = [];
  const searchedUrls = new Set<string>();
  const activeWebOpens = new Set<string>();
  let capturedBytes = 0;
  let phase: "initial" | "thread" | "turn" | "complete" = "initial";
  let finalText: string | undefined;
  let tokenUsage: CodexTokenUsage | undefined;
  for (const line of lines) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(line);
    } catch {
      throw new CodexRunnerError("output_invalid");
    }
    const parsed = EventSchema.safeParse(decoded);
    if (!parsed.success) throw new CodexRunnerError("output_invalid");
    const event = parsed.data;
    eventTypes.push(event.type);
    if (event.type === "thread.started" && phase === "initial") {
      phase = "thread";
      continue;
    }
    if (event.type === "turn.started" && phase === "thread") {
      phase = "turn";
      continue;
    }
    if (event.type === "turn.completed" && phase === "turn") {
      if (event.usage !== undefined) {
        tokenUsage = Object.freeze({
          inputTokens: event.usage.input_tokens,
          cachedInputTokens: event.usage.cached_input_tokens,
          cacheWriteInputTokens: event.usage.cache_write_input_tokens,
          outputTokens: event.usage.output_tokens,
          reasoningOutputTokens: event.usage.reasoning_output_tokens,
        });
      }
      phase = "complete";
      continue;
    }
    if (
      ITEM_EVENTS.has(event.type) &&
      event.item?.type === "error" &&
      (phase === "thread" || phase === "turn")
    )
      continue;
    if (
      !ITEM_EVENTS.has(event.type) ||
      phase !== "turn" ||
      event.item === undefined
    )
      throw new CodexRunnerError("output_invalid");
    assertAllowedItem(event.item.type, browsingPolicy);
    if (event.type === "item.started" && event.item.type === "web_open") {
      if (event.item.id === undefined)
        throw new CodexRunnerError("output_invalid");
      if (activeWebOpens.has(event.item.id))
        throw new CodexRunnerError("output_invalid");
      activeWebOpens.add(event.item.id);
      if (
        activeWebOpens.size > CODEX_RUNTIME_POLICY.maxReportedConcurrentWebOpens
      )
        throw new CodexRunnerError("policy_violation");
      continue;
    }
    if (event.type !== "item.completed") continue;
    if (event.item.type === "web_search") {
      if (event.item.query === undefined)
        throw new CodexRunnerError("output_invalid");
      if (/^https:\/\//i.test(event.item.query)) {
        const searchedUrl = new URL(event.item.query);
        assertCapturedPublicHttps(searchedUrl.href);
        searchedUrls.add(searchedUrl.href);
      }
      toolTranscript.push(Object.freeze({ type: "web_search" }));
      continue;
    }
    if (event.item.type === "web_open") {
      const artifact = capturedWebArtifact(event.item);
      if (event.item.id !== undefined) activeWebOpens.delete(event.item.id);
      capturedBytes += artifact.content.byteLength;
      if (capturedBytes > CODEX_RUNTIME_POLICY.maxCapturedWebAttemptBytes)
        throw new CodexRunnerError("output_invalid");
      webArtifacts.push(artifact);
      toolTranscript.push(
        Object.freeze({
          type: "web_open",
          artifactId: artifact.artifactId,
          url: artifact.url,
          contentHash: artifact.contentHash,
        }),
      );
      continue;
    }
    if (
      event.type === "item.completed" &&
      event.item.type === "agent_message"
    ) {
      if (
        event.item.text === undefined ||
        Buffer.byteLength(event.item.text, "utf8") > appliedCaps.maxPayloadBytes
      )
        throw new CodexRunnerError("output_invalid");
      finalText = event.item.text;
    }
  }
  if (
    phase !== "complete" ||
    finalText === undefined ||
    activeWebOpens.size > 0 ||
    eventTypes.some(
      (type) => !LIFECYCLE_EVENTS.has(type) && !ITEM_EVENTS.has(type),
    )
  )
    throw new CodexRunnerError("output_invalid");
  return Object.freeze({
    eventTypes: Object.freeze(eventTypes),
    finalText,
    searchedUrls: Object.freeze([...searchedUrls]),
    toolEventCount: toolTranscript.length,
    toolTranscript: Object.freeze(toolTranscript),
    webArtifacts: Object.freeze(webArtifacts),
    ...(tokenUsage === undefined ? {} : { tokenUsage }),
  });
}
