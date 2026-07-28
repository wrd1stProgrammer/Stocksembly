import { createHash } from "node:crypto";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import type { LocalAuth } from "./localAuth";

const COGNITO_COOKIE_NAME = "stocksembly_cognito_session";

export type ResearchPrincipal = {
  readonly id: string;
  readonly kind: "local" | "cognito";
  readonly subject?: string;
  readonly username?: string;
};

export type ResearchAuthentication =
  | {
      readonly kind: "authenticated";
      readonly principal: ResearchPrincipal;
      readonly via: "bearer" | "cookie";
    }
  | { readonly kind: "unauthorized" };

export type ResearchAuth = {
  readonly automationTokenPath: string;
  readonly bootstrapSession: () => Promise<string>;
  readonly bootstrapSessionResponse: (request: Request) => Promise<Response>;
  readonly authenticate: (request: Request) => Promise<ResearchAuthentication>;
  readonly rotateIdentity: () => Promise<void>;
};

type CognitoConfiguration = {
  readonly userPoolId: string;
  readonly clientId: string;
  readonly secureCookie: boolean;
};

function bearerToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return undefined;
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : undefined;
}

function cookieToken(request: Request): string | undefined {
  const prefix = `${COGNITO_COOKIE_NAME}=`;
  const values = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(prefix))
    .map((part) => part.slice(prefix.length));
  if (values?.length !== 1) return undefined;
  try {
    return decodeURIComponent(values[0] ?? "");
  } catch {
    return undefined;
  }
}

function principalId(subject: string): string {
  return createHash("sha256")
    .update(`stocksembly-cognito-principal-v1:${subject}`)
    .digest("hex");
}

function cognitoCookie(
  token: string,
  expiresAt: number,
  secure: boolean,
): string {
  const maxAge = Math.max(
    0,
    Math.min(expiresAt - Math.floor(Date.now() / 1000), 86_400),
  );
  return [
    `${COGNITO_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : undefined,
    `Max-Age=${maxAge}`,
  ]
    .filter(Boolean)
    .join("; ");
}

function clearedCognitoCookie(secure: boolean): string {
  return [
    `${COGNITO_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : undefined,
    "Max-Age=0",
  ]
    .filter(Boolean)
    .join("; ");
}

export function createResearchAuth(
  localAuth: LocalAuth,
  configuration?: CognitoConfiguration,
  rotateLocalIdentity?: () => Promise<LocalAuth>,
): ResearchAuth {
  if (configuration === undefined) {
    return {
      automationTokenPath: localAuth.automationTokenPath,
      bootstrapSession: () =>
        Promise.resolve(localAuth.createBootstrapCookie()),
      bootstrapSessionResponse: (request) =>
        Promise.resolve(
          request.method === "GET"
            ? new Response(null, {
                status: 204,
                headers: { "set-cookie": localAuth.createBootstrapCookie() },
              })
            : Response.json(
                { error: { code: "METHOD_NOT_ALLOWED" } },
                { status: 405 },
              ),
        ),
      authenticate: (request) =>
        Promise.resolve(localAuth.authenticate(request)),
      rotateIdentity: async () => {
        if (rotateLocalIdentity !== undefined) {
          localAuth = await rotateLocalIdentity();
        }
      },
    };
  }

  const verifier = CognitoJwtVerifier.create({
    userPoolId: configuration.userPoolId,
    tokenUse: "access",
    clientId: configuration.clientId,
  });

  const verify = async (
    token: string,
    via: "bearer" | "cookie",
  ): Promise<ResearchAuthentication> => {
    try {
      const payload = await verifier.verify(token);
      return {
        kind: "authenticated",
        via,
        principal: {
          kind: "cognito",
          id: principalId(payload.sub),
          subject: payload.sub,
          ...(typeof payload.username === "string"
            ? { username: payload.username }
            : {}),
        },
      };
    } catch {
      return { kind: "unauthorized" };
    }
  };

  return {
    automationTokenPath: localAuth.automationTokenPath,
    bootstrapSession: () => Promise.resolve(""),
    async bootstrapSessionResponse(request) {
      if (request.method === "DELETE") {
        return new Response(null, {
          status: 204,
          headers: {
            "set-cookie": clearedCognitoCookie(configuration.secureCookie),
          },
        });
      }
      if (request.method !== "GET") {
        return Response.json(
          { error: { code: "METHOD_NOT_ALLOWED" } },
          { status: 405 },
        );
      }
      const token = bearerToken(request);
      if (token === undefined) {
        return Response.json(
          { error: { code: "AUTHENTICATION_REQUIRED" } },
          { status: 401 },
        );
      }
      try {
        const payload = await verifier.verify(token);
        const existing = cookieToken(request);
        return new Response(null, {
          status: 204,
          headers: {
            "set-cookie": cognitoCookie(
              token,
              payload.exp,
              configuration.secureCookie,
            ),
            "x-stocksembly-session-changed":
              existing === token ? "false" : "true",
          },
        });
      } catch {
        return Response.json(
          { error: { code: "AUTHENTICATION_REQUIRED" } },
          { status: 401 },
        );
      }
    },
    async authenticate(request) {
      const token = bearerToken(request);
      if (token !== undefined) {
        const automation = localAuth.authenticate(request);
        if (automation.kind === "authenticated") return automation;
        return await verify(token, "bearer");
      }
      const cookie = cookieToken(request);
      return cookie === undefined
        ? { kind: "unauthorized" }
        : await verify(cookie, "cookie");
    },
    rotateIdentity: async () => {
      if (rotateLocalIdentity !== undefined) {
        localAuth = await rotateLocalIdentity();
      }
    },
  };
}
