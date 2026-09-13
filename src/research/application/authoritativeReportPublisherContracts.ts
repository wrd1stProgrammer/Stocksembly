export type AcceptedChairFence = {
  readonly jobId: string;
  readonly attemptId: string;
  readonly ordinal: number;
  readonly ownerId: string;
  readonly token: number;
};

export type PublishAuthoritativeReportInput = {
  readonly runId: string;
  readonly acceptedChairArtifactId: string;
  readonly fence: AcceptedChairFence;
};
