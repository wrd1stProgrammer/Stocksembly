import { deriveSecUserAgent } from "./secClientIdentity.internal";
import {
  configureSecIdentity,
  SecIdentityConfigError,
  SecIdentityInputSchema,
} from "./secIdentityConfig";

export type SecIdentityInteractiveOptions = {
  readonly dataRoot: string;
  readonly prompt: (label: string) => Promise<string>;
  readonly confirm: (derivedUserAgent: string) => Promise<boolean>;
};

export async function configureSecIdentityInteractively(
  options: SecIdentityInteractiveOptions,
) {
  const organization = await options.prompt("Organization");
  const contactEmail = await options.prompt("Monitored contact email");
  const parsed = SecIdentityInputSchema.safeParse({
    organization,
    contactEmail,
  });
  if (!parsed.success)
    throw new SecIdentityConfigError("SEC_IDENTITY_MALFORMED");
  const confirmed = await options.confirm(deriveSecUserAgent(parsed.data));
  if (!confirmed)
    throw new SecIdentityConfigError("SEC_IDENTITY_CONFIRMATION_DECLINED");
  return configureSecIdentity(options.dataRoot, parsed.data);
}
