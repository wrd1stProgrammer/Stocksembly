import type { ResearchAuthentication } from "../../research/server/http/researchAuth";

export type AdminAuthorization =
  | { readonly kind: "authorized"; readonly principalId: string }
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "forbidden" };

export function authorizeAdmin(
  authentication: ResearchAuthentication,
): AdminAuthorization {
  if (authentication.kind === "unauthorized")
    return { kind: "unauthenticated" };
  const principal = authentication.principal;
  if (
    principal.kind !== "cognito" ||
    !principal.groups?.some((group) => group === "admin")
  ) {
    return { kind: "forbidden" };
  }
  return { kind: "authorized", principalId: principal.id };
}
