import { aboutDocument } from "./about";
import { contactDocument } from "./contact";
import type {
  PublicInformationDocument,
  PublicInformationKey,
} from "./contracts";
import { correctionsDocument } from "./corrections";
import { editorialPolicyDocument } from "./editorialPolicy";
import { methodologyDocument } from "./methodology";

export const publicInformationDocuments = {
  about: aboutDocument,
  methodology: methodologyDocument,
  "editorial-policy": editorialPolicyDocument,
  corrections: correctionsDocument,
  contact: contactDocument,
} as const satisfies Readonly<
  Record<PublicInformationKey, PublicInformationDocument>
>;
