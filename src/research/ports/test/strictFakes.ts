import {
  CikSchema,
  IssuerIdSchema,
  SourceIdSchema,
  TickerSymbolSchema,
} from "../../domain/ids";
import type {
  ArtifactCasPort,
  DiskCapacityProbePort,
  IssuerSourcePort,
  MacroSourcePort,
  SecSourcePort,
  SnapshotClockPort,
  TransactionalResearchStorePort,
} from "../index";
import {
  StrictArtifactCasFake,
  StrictCancellationSignalFake,
  StrictCapacityProbeFake,
  StrictCodexRunnerFake,
  StrictIssuerSourceFake,
  StrictMacroSourceFake,
  StrictPublicEventNotifierFake,
  StrictSecSourceFake,
  StrictSnapshotClockFake,
} from "./serviceFakes";
import { StrictTransactionalStoreFake } from "./storeFakes";

export type StrictTestPorts = {
  readonly mode: "test";
  readonly stores: TransactionalResearchStorePort;
  readonly artifacts: ArtifactCasPort;
  readonly issuer: IssuerSourcePort;
  readonly sec: SecSourcePort;
  readonly macro: MacroSourcePort;
  readonly clock: SnapshotClockPort;
  readonly capacity: DiskCapacityProbePort;
  readonly codex: StrictCodexRunnerFake;
  readonly cancellation: StrictCancellationSignalFake;
  readonly notifier: StrictPublicEventNotifierFake;
};

export function createStrictTestPorts(): StrictTestPorts {
  const timestamp = "2026-07-22T00:00:00.000Z";
  const document = {
    sourceId: SourceIdSchema.parse("00000000-0000-4000-8000-000000000021"),
    retrievedAt: timestamp,
    publishedAt: timestamp,
    mediaType: "application/json",
    bytes: new TextEncoder().encode("{}"),
  };
  return {
    mode: "test",
    stores: new StrictTransactionalStoreFake(),
    artifacts: new StrictArtifactCasFake(),
    issuer: new StrictIssuerSourceFake({
      issuerId: IssuerIdSchema.parse("00000000-0000-4000-8000-000000000022"),
      cik: CikSchema.parse("1045810"),
      ticker: TickerSymbolSchema.parse("NVDA"),
      legalName: "NVIDIA Corporation",
      exchange: "NASDAQ",
    }),
    sec: new StrictSecSourceFake([document]),
    macro: new StrictMacroSourceFake([document]),
    clock: new StrictSnapshotClockFake(timestamp),
    capacity: new StrictCapacityProbeFake(4_096),
    codex: new StrictCodexRunnerFake(),
    cancellation: new StrictCancellationSignalFake(),
    notifier: new StrictPublicEventNotifierFake(),
  };
}
