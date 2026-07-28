import {
  type SecurityIdentityAdmission,
  validateSecurityIdentityInput,
} from "./securityIdentity";
import { registerSupportedSecurityIdentity } from "./securityIdentity.membership";

export function admitFixtureSecurityIdentity(
  input: unknown,
): SecurityIdentityAdmission {
  const result = validateSecurityIdentityInput(input);
  if (result.kind === "admitted") {
    registerSupportedSecurityIdentity(result.identity);
  }
  return result;
}
