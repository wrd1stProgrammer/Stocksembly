"use client";

// Amplify v6 requires the OAuth listener to consume the Hosted UI callback
// code before fetchAuthSession can restore the browser session.
import "aws-amplify/auth/enable-oauth-listener";
import { Amplify } from "aws-amplify";

type PublicAuthConfiguration = {
  readonly userPoolId: string;
  readonly userPoolClientId: string;
  readonly domain?: string;
};

let configured = false;

function publicConfiguration(): PublicAuthConfiguration | undefined {
  const userPoolId = process.env["NEXT_PUBLIC_COGNITO_USER_POOL_ID"];
  const userPoolClientId =
    process.env["NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID"];
  if (!userPoolId || !userPoolClientId) return undefined;
  const domain = process.env["NEXT_PUBLIC_COGNITO_DOMAIN"];
  return {
    userPoolId,
    userPoolClientId,
    ...(domain ? { domain } : {}),
  };
}

export function authIsConfigured(): boolean {
  return publicConfiguration() !== undefined;
}

export function googleAuthIsConfigured(): boolean {
  return publicConfiguration()?.domain !== undefined;
}

export function configureAmplifyAuth(): boolean {
  if (configured) return true;
  const configuration = publicConfiguration();
  if (!configuration) return false;

  const origin =
    process.env["NEXT_PUBLIC_APP_ORIGIN"] ??
    (typeof window === "undefined"
      ? "https://stocksembly.com"
      : window.location.origin);
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: configuration.userPoolId,
        userPoolClientId: configuration.userPoolClientId,
        signUpVerificationMethod: "code",
        loginWith: {
          email: true,
          ...(configuration.domain
            ? {
                oauth: {
                  domain: configuration.domain,
                  scopes: ["openid", "email", "profile"],
                  redirectSignIn: [`${origin}/auth/callback`],
                  redirectSignOut: [`${origin}/login`],
                  responseType: "code",
                } as const,
              }
            : {}),
        },
        passwordFormat: {
          minLength: 10,
          requireLowercase: true,
          requireUppercase: true,
          requireNumbers: true,
          requireSpecialCharacters: false,
        },
      },
    },
  });
  configured = true;
  return true;
}
