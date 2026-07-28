import type {
  Cik,
  IssuerId,
  SnapshotId,
  SourceId,
  TickerSymbol,
} from "../domain/ids";

export type SourceCapability = {
  readonly available: boolean;
  readonly reason?: string;
};

export type IssuerIdentity = {
  readonly issuerId: IssuerId;
  readonly cik: Cik;
  readonly ticker: TickerSymbol;
  readonly legalName: string;
  readonly exchange: string;
};

export interface IssuerSourcePort {
  readonly capability: () => Promise<SourceCapability>;
  readonly resolve: (
    ticker: TickerSymbol,
    cutoffAt: string,
  ) => Promise<IssuerIdentity | undefined>;
}

export type SourceDocument = {
  readonly sourceId: SourceId;
  readonly retrievedAt: string;
  readonly publishedAt?: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
};

export type SecCollectionRequest = {
  readonly issuer: IssuerIdentity;
  readonly snapshotId: SnapshotId;
  readonly cutoffAt: string;
};

export interface SecSourcePort {
  readonly capability: () => Promise<SourceCapability>;
  readonly collect: (
    request: SecCollectionRequest,
  ) => Promise<readonly SourceDocument[]>;
}

export type MacroCollectionRequest = {
  readonly seriesIds: readonly string[];
  readonly snapshotId: SnapshotId;
  readonly cutoffAt: string;
};

export interface MacroSourcePort {
  readonly capability: () => Promise<SourceCapability>;
  readonly collect: (
    request: MacroCollectionRequest,
  ) => Promise<readonly SourceDocument[]>;
}
