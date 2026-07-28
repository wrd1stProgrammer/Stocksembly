import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { CodexRunnerError } from "./codexErrors";

const SAFE_SANDBOX_PATH = /^\/[A-Za-z0-9._/-]+$/;

function literal(path: string): string {
  if (!SAFE_SANDBOX_PATH.test(path))
    throw new CodexRunnerError("policy_violation");
  return `(literal "${path}")`;
}

function subtree(path: string): string {
  if (!SAFE_SANDBOX_PATH.test(path))
    throw new CodexRunnerError("policy_violation");
  return `(subpath "${path}")`;
}

function parentDirectories(path: string): readonly string[] {
  const parents: string[] = [];
  let parent = dirname(path);
  while (parent !== "/") {
    parents.unshift(parent);
    parent = dirname(parent);
  }
  return parents;
}

export function buildSandboxProfile(input: {
  readonly codexLink: string;
  readonly codexOrigin: string;
  readonly schemaPath: string;
  readonly attemptRoot: string;
  readonly runtimePaths: readonly string[];
  readonly certificatePath: string;
  readonly protectedHome: string;
  readonly allowNetwork?: boolean;
  readonly networkProxyPort?: number;
}): string {
  if (input.allowNetwork === true && input.networkProxyPort !== undefined)
    throw new CodexRunnerError("policy_violation");
  if (
    input.networkProxyPort !== undefined &&
    (!Number.isInteger(input.networkProxyPort) ||
      input.networkProxyPort < 1 ||
      input.networkProxyPort > 65_535)
  )
    throw new CodexRunnerError("policy_violation");
  return [
    "(version 1)",
    "(deny default)",
    "(allow process-fork)",
    `(allow process-exec ${literal(input.codexLink)})`,
    ...(input.allowNetwork === true
      ? ["(allow network-outbound)"]
      : input.networkProxyPort === undefined
        ? []
        : [
          `(allow network-outbound (remote ip "localhost:${input.networkProxyPort}"))`,
          ]),
    "(allow mach-lookup)",
    "(allow ipc-posix-shm)",
    "(allow ipc-posix-sem)",
    "(allow sysctl-read)",
    "(allow system-socket)",
    '(allow user-preference-read (preference-domain "kCFPreferencesAnyApplication"))',
    '(allow file-read-data (literal "/"))',
    `(allow file-read-metadata (literal "/") ${literal("/var")} ${literal("/etc")} ${parentDirectories(input.attemptRoot).map(literal).join(" ")})`,
    `(allow file-read* ${subtree("/System")} ${subtree("/usr/lib")} ${subtree("/usr/share/zoneinfo")} ${subtree("/etc/ssl")} ${subtree("/private/etc/ssl")} ${literal("/dev/null")} ${literal("/dev/urandom")} ${subtree("/Applications/ChatGPT.app/Contents/Resources")} ${subtree(input.attemptRoot)} ${literal(input.codexLink)} ${literal(input.schemaPath)} ${literal(input.certificatePath)} ${input.runtimePaths.map(subtree).join(" ")})`,
    `(allow file-write* ${input.runtimePaths.map(subtree).join(" ")})`,
    `(deny file-read* ${subtree("/Volumes")} ${subtree("/Network")})`,
  ].join("\n");
}

export function hashSandboxProfile(profile: string): string {
  return createHash("sha256").update(profile, "utf8").digest("hex");
}
