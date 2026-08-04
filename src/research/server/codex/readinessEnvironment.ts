import { join } from "node:path";
import { CODEX_RUNTIME_PINS } from "./codexPolicy";
import type { SpawnInvocation } from "./codexTypes";
import { CodexIsolationError } from "./readiness";

const CHILD_KEYS = [
  "CODEX_HOME",
  "HOME",
  "LANG",
  "LC_ALL",
  "NO_COLOR",
  "PATH",
  "SSL_CERT_FILE",
  "TMPDIR",
] as const;

const PROXY_CHILD_KEYS = [
  "ALL_PROXY",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
] as const;

function exactKeys(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    actual.length === expected.length &&
    expected.every((key, index) => actual[index] === key)
  );
}

function authenticatedLoopbackProxy(
  environment: SpawnInvocation["environment"],
): boolean {
  const {
    ALL_PROXY: allProxy,
    HTTP_PROXY: proxy,
    HTTPS_PROXY: httpsProxy,
    NO_PROXY: noProxy,
  } = environment;
  if (
    proxy === undefined ||
    proxy !== httpsProxy ||
    proxy !== allProxy ||
    noProxy !== ""
  )
    return false;
  try {
    const url = new URL(proxy);
    const port = Number.parseInt(url.port, 10);
    return (
      url.protocol === "http:" &&
      url.hostname === "127.0.0.1" &&
      url.username.length > 0 &&
      url.password.length > 0 &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "" &&
      Number.isInteger(port) &&
      port >= 1 &&
      port <= 65_535
    );
  } catch {
    return false;
  }
}

export function assertExactReadinessEnvironment(
  invocation: SpawnInvocation,
  attemptDir: string,
  inheritedSentinelName: string,
  pins: {
    readonly certificatePath: string;
    readonly locale: string;
  } = CODEX_RUNTIME_PINS,
): void {
  const actualKeys = Object.keys(invocation.environment).sort();
  const coreKeys = [...CHILD_KEYS].sort();
  const proxyKeys = [...CHILD_KEYS, ...PROXY_CHILD_KEYS].sort();
  const usesProxy = PROXY_CHILD_KEYS.some((key) =>
    Object.hasOwn(invocation.environment, key),
  );
  if (
    !(usesProxy
      ? exactKeys(actualKeys, proxyKeys) &&
        authenticatedLoopbackProxy(invocation.environment)
      : exactKeys(actualKeys, coreKeys))
  )
    throw new CodexIsolationError("environment", "environment_keys");
  const expected = Object.freeze({
    CODEX_HOME: join(attemptDir, "codex-home"),
    HOME: join(attemptDir, "home"),
    LANG: pins.locale,
    LC_ALL: pins.locale,
    NO_COLOR: "1",
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    SSL_CERT_FILE: pins.certificatePath,
    TMPDIR: join(attemptDir, "tmp"),
  });
  if (
    CHILD_KEYS.some((key) => invocation.environment[key] !== expected[key]) ||
    Object.hasOwn(invocation.environment, inheritedSentinelName)
  )
    throw new CodexIsolationError("environment", "environment_values");
}
