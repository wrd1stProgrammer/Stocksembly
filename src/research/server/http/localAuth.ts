import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  ensureLocalAuthFiles,
  type LocalAuthFiles,
  rotateLocalAuthFiles,
} from "./localAuthFiles";

const COOKIE_NAME = "stocksembly_local_session";

export type LocalPrincipal = {
  readonly kind: "local";
  readonly id: string;
};

export type LocalAuthentication =
  | {
      readonly kind: "authenticated";
      readonly principal: LocalPrincipal;
      readonly via: "bearer" | "cookie";
    }
  | { readonly kind: "unauthorized" };

export type LocalAuth = {
  readonly epoch: string;
  readonly automationTokenPath: string;
  readonly principal: LocalPrincipal;
  readonly createBootstrapCookie: () => string;
  readonly authenticate: (request: Request) => LocalAuthentication;
};

function constantTimeMatches(candidate: string, expected: string): boolean {
  const candidateDigest = createHash("sha256").update(candidate).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

function cookieCredential(request: Request): string | undefined {
  const values = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${COOKIE_NAME}=`))
    .map((part) => part.slice(COOKIE_NAME.length + 1));
  return values?.length === 1 ? values[0] : undefined;
}

function buildLocalAuth(files: LocalAuthFiles): LocalAuth {
  const epoch = createHash("sha256").update(files.secret).digest("base64url");
  const principal = Object.freeze({
    kind: "local" as const,
    id: createHmac("sha256", files.secret)
      .update("stocksembly-local-principal-v1")
      .digest("hex"),
  });
  const payload = `v1.${epoch}`;
  const signature = createHmac("sha256", files.secret)
    .update(payload)
    .digest("base64url");
  const cookieValue = `${payload}.${signature}`;
  return {
    epoch,
    automationTokenPath: files.tokenPath,
    principal,
    createBootstrapCookie: () =>
      `${COOKIE_NAME}=${cookieValue}; Path=/; HttpOnly; SameSite=Strict`,
    authenticate: (request) => {
      const authorization = request.headers.get("authorization");
      if (authorization !== null) {
        return constantTimeMatches(authorization, `Bearer ${files.token}`)
          ? { kind: "authenticated", principal, via: "bearer" }
          : { kind: "unauthorized" };
      }
      const candidate = cookieCredential(request);
      return candidate !== undefined &&
        constantTimeMatches(candidate, cookieValue)
        ? { kind: "authenticated", principal, via: "cookie" }
        : { kind: "unauthorized" };
    },
  };
}

export async function ensureLocalAuth(dataRoot: string): Promise<LocalAuth> {
  return buildLocalAuth(await ensureLocalAuthFiles(dataRoot));
}

export async function rotateLocalAuth(dataRoot: string): Promise<LocalAuth> {
  return buildLocalAuth(await rotateLocalAuthFiles(dataRoot));
}
