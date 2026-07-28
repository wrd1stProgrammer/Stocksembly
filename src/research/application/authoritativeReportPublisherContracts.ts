import type { ArtifactCasPort } from "../ports/artifacts";

export type AcceptedChairFence = {
  readonly jobId: string;
  readonly attemptId: string;
  readonly ordinal: number;
  readonly ownerId: string;
  readonly token: number;
};

export type PublishAuthoritativeReportOptions = {
  readonly databasePath: string;
  readonly cas: ArtifactCasPort;
  readonly now?: () => string;
  readonly newId?: () => string;
};

export type PublishAuthoritativeReportInput = {
  readonly runId: string;
  readonly acceptedChairArtifactId: string;
  readonly fence: AcceptedChairFence;
};
