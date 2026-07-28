import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { CapturedWebArtifact } from "../codex/codexTypes";

const MAX_BYTES = 512 * 1_024;
const MAX_REDIRECTS = 3;

type Dependencies = {
  readonly createId?: () => string;
  readonly fetch?: typeof fetch;
  readonly now?: () => string;
  readonly resolveAddresses?: (hostname: string) => Promise<readonly string[]>;
};

function publicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [first = -1, second = -1] = address
      .split(".")
      .map((part) => Number(part));
    return !(
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      first >= 224
    );
  }
  if (version !== 6) return false;
  const normalized = address.toLowerCase();
  return !(
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/u.test(normalized) ||
    normalized.startsWith("::ffff:")
  );
}

async function assertPublicHttps(
  value: string,
  resolveAddresses: (hostname: string) => Promise<readonly string[]>,
): Promise<URL> {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    url.hostname.endsWith(".local")
  )
    throw new TypeError("question web source must be public HTTPS");
  const addresses =
    isIP(url.hostname) === 0
      ? await resolveAddresses(url.hostname)
      : [url.hostname];
  if (addresses.length === 0 || addresses.some((ip) => !publicAddress(ip)))
    throw new TypeError("question web source resolved outside public internet");
  return url;
}

function readableText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&#39;/giu, "'")
    .replace(/&quot;/giu, '"')
    .replace(/\s+/gu, " ")
    .trim();
}

function pageTitle(html: string, fallback: string): string {
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1];
  return title === undefined
    ? fallback
    : readableText(title).slice(0, 1_024) || fallback;
}

async function defaultResolve(hostname: string): Promise<readonly string[]> {
  return (await lookup(hostname, { all: true, verbatim: true })).map(
    (entry) => entry.address,
  );
}

export async function collectQuestionWebEvidence(
  sourceUrl: string,
  dependencies: Dependencies = {},
): Promise<CapturedWebArtifact> {
  const resolveAddresses = dependencies.resolveAddresses ?? defaultResolve;
  const fetchPage = dependencies.fetch ?? fetch;
  let current = await assertPublicHttps(sourceUrl, resolveAddresses);
  let response: Response | undefined;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    response = await fetchPage(current, {
      headers: {
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
        "user-agent": "StocksemblyResearch/1.0",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get("location");
    if (location === null || redirect === MAX_REDIRECTS)
      throw new TypeError("question web source redirect was rejected");
    current = await assertPublicHttps(
      new URL(location, current).href,
      resolveAddresses,
    );
  }
  if (response === undefined || !response.ok)
    throw new TypeError("question web source could not be fetched");
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES)
    throw new TypeError("question web source exceeded the capture limit");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES)
    throw new TypeError("question web source exceeded the capture limit");
  const html = new TextDecoder("utf-8").decode(bytes);
  const text = readableText(html);
  if (text.length === 0)
    throw new TypeError("question web source had no readable content");
  return {
    artifactId: (dependencies.createId ?? randomUUID)(),
    url: sourceUrl,
    title: pageTitle(html, current.hostname),
    publisher: current.hostname.replace(/^www\./u, ""),
    retrievedAt: (dependencies.now ?? (() => new Date().toISOString()))(),
    excerpt: text.slice(0, 1_500),
    contentHash: createHash("sha256").update(bytes).digest("hex"),
    content: bytes,
  };
}
