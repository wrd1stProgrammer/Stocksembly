import type { Locale } from "../../lib/i18n";
import type {
  CompositionOrigin,
  ResearchArtifactFor,
  ResearchEventWithModeFor,
  ResearchMode,
  ResearchSnapshot,
  ResearchSnapshotFor,
} from "../compositionMode";
import type { AgentProfile, ResearchCompany, ResearchPhase } from "../types";

export { validateCompositionPayload } from "./payloadValidation";

export type LocalizedText = Readonly<Record<Locale, string>>;

export type ResearchEvidenceStrength =
  | "strong"
  | "moderate"
  | "limited"
  | "contested"
  | "unverified";

export type ResearchFileData = {
  readonly researchDirection?: string;
  readonly marketSnapshot?: {
    readonly price: string;
    readonly currency: string;
    readonly observedAt: string;
    readonly marketState: string;
  };
  readonly qualityScorecard?: {
    readonly evidenceCoverage: number;
    readonly freshnessCoverage: number;
    readonly rebuttalResolution: number;
  };
  readonly claimMatrix?: readonly {
    readonly id: string;
    readonly claim: LocalizedText;
    readonly verdict:
      | "entailed"
      | "partial"
      | "contradicted"
      | "not_assessable";
    readonly sourceCount: number;
    readonly sourceRefs: readonly string[];
    readonly strength: ResearchEvidenceStrength;
    readonly counterpoint?: LocalizedText;
    readonly checkpoint?: LocalizedText;
  }[];
  readonly evidenceIndex: readonly {
    readonly id: string;
    readonly publisher: string;
    readonly title: string;
    readonly sourceClass: string;
    readonly observedAt?: string;
    readonly freshness?: "current" | "stale" | "unavailable";
    readonly url?: string;
  }[];
  readonly coverage: readonly {
    readonly label: string;
    readonly provider: string;
    readonly status:
      | "available"
      | "stale"
      | "unavailable"
      | "withheld_by_rights";
    readonly period: string;
  }[];
  readonly teamViews: readonly {
    readonly departmentId: "market" | "company" | "financial" | "risk";
    readonly representativeId: "market" | "company" | "financial" | "risk";
    readonly teamName: LocalizedText;
    readonly position: LocalizedText;
    readonly vote:
      | "support"
      | "support_with_reservations"
      | "oppose"
      | "abstain";
    readonly rationale: LocalizedText;
  }[];
  readonly posture: "positive" | "neutral" | "caution";
  readonly postureLabel: LocalizedText;
  readonly limitationNote: LocalizedText;
  readonly evidenceScore: {
    readonly passed: number;
    readonly denominator: number;
  };
  readonly sourceCount: number;
  readonly claimCount: number;
  readonly asOf: LocalizedText;
  readonly freshness: LocalizedText;
  readonly condition: LocalizedText;
  readonly expectation: LocalizedText;
  readonly valuation: LocalizedText;
  readonly nextEvent: LocalizedText;
  readonly thesis: LocalizedText;
  readonly changeCondition: LocalizedText;
  readonly positives: readonly LocalizedText[];
  readonly concerns: readonly LocalizedText[];
  readonly analysis: readonly {
    readonly title: LocalizedText;
    readonly summary: LocalizedText;
    readonly detail: LocalizedText;
  }[];
  readonly scenarios: readonly {
    readonly id: string;
    readonly label: LocalizedText;
    readonly probability: string;
    readonly thesis: LocalizedText;
    readonly assumptions: readonly (
      | {
          readonly kind: "metric";
          readonly metric: LocalizedText;
          readonly displayValue: LocalizedText;
          readonly basis: LocalizedText;
          readonly sourceRefs: readonly string[];
        }
      | {
          readonly kind: "unverified";
          readonly note: LocalizedText;
        }
    )[];
  }[];
  readonly appendix: readonly {
    readonly title: LocalizedText;
    readonly items: readonly LocalizedText[];
  }[];
  readonly versions: readonly {
    readonly version: string;
    readonly date: string;
    readonly label: LocalizedText;
  }[];
};

export type ResearchHistoryGroup = {
  readonly symbol: string;
  readonly company: string;
  readonly runs: readonly {
    readonly label: string;
    readonly date: string;
    readonly live?: boolean;
  }[];
};

export type ResearchSource = {
  readonly en: string;
  readonly ko: string;
};

export type CompositionDataFor<M extends ResearchMode> = {
  readonly agents: readonly AgentProfile[];
  readonly events: readonly ResearchEventWithModeFor<M>[];
  readonly playbackEvents: readonly ResearchEventWithModeFor<M>[];
  readonly phaseLabels: PhaseLabels;
  readonly report: ResearchFileData;
  readonly artifacts: readonly ResearchArtifactFor<M>[];
  readonly history: readonly ResearchHistoryGroup[];
  readonly defaultAgentIds: readonly AgentProfile["id"][];
  readonly sources: readonly ResearchSource[];
  readonly createCompany: (
    symbol: string,
    company: string,
    exchange: string,
    sector: string,
  ) => ResearchCompany;
};

export type CompositionData = CompositionDataFor<ResearchMode>;
export type CompositionViewDataFor<M extends ResearchMode> = Omit<
  CompositionDataFor<M>,
  "createCompany"
>;
export type CompositionViewData = CompositionViewDataFor<ResearchMode>;

export type ResearchCodexPort = {
  readonly id: string;
  readonly kind: "fake" | "real";
  readonly run: (input: unknown) => Promise<unknown>;
};

export type CodexInvocationReceiptFor<M extends ResearchMode> = {
  readonly kind: M extends "fixture" ? "fake" : "real";
  readonly invocationCount: number;
};

export type ResearchCompositionPayloadFor<M extends ResearchMode> = {
  readonly mode: M;
  readonly origin: CompositionOrigin<M>;
  readonly data: CompositionViewDataFor<M>;
  readonly snapshot: ResearchSnapshotFor<M>;
  readonly codex: CodexInvocationReceiptFor<M>;
};

export type ResearchCompositionPayload =
  | ResearchCompositionPayloadFor<"fixture">
  | ResearchCompositionPayloadFor<"official">;

export type ResearchComposition<M extends ResearchMode = ResearchMode> = {
  readonly name: M;
  readonly mode: M;
  readonly createCompany: CompositionDataFor<M>["createCompany"];
  readonly createPayload: () => Promise<ResearchCompositionPayloadFor<M>>;
  readonly openSnapshot: (snapshot: ResearchSnapshot) => ResearchSnapshot;
};

export type LiveEvidenceAdapter = {
  readonly id: string;
  readonly kind: "live";
  readonly collect: (symbol: string) => Promise<unknown>;
};

export type RecordedEvidenceAdapter = {
  readonly id: string;
  readonly kind: "recorded";
  readonly collect: (symbol: string) => Promise<unknown>;
};

export type OfficialDependencies = {
  readonly evidenceAdapters: readonly (
    | LiveEvidenceAdapter
    | RecordedEvidenceAdapter
  )[];
  readonly codex: ResearchCodexPort;
  readonly buildData?: (input: {
    readonly evidence: readonly unknown[];
    readonly codex: unknown;
  }) => Promise<CompositionViewDataFor<"official">>;
};

export type PhaseLabels = Readonly<
  Record<ResearchPhase, Readonly<Record<Locale, string>>>
>;
