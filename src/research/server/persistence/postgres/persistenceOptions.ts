import type { ArtifactCasPort } from "../../../ports/artifacts";
import type { ResearchDatabase } from "./database";

export type PublishAuthoritativeReportOptions = {
  readonly database: ResearchDatabase;
  readonly cas: ArtifactCasPort;
  readonly now?: () => string;
  readonly newId?: () => string;
};

export type StructuralAuditPersistenceOptions = {
  readonly database: ResearchDatabase;
  readonly cas: ArtifactCasPort;
  readonly now?: () => string;
};
