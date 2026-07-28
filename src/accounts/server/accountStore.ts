import type {
  PublicReport,
  PublicRun,
  RunCursor,
} from "../../research/server/api/researchApiContracts";
import type { PublicQuestion } from "../../research/server/api/researchCommandContracts";
import type { ResearchPrincipal } from "../../research/server/http/researchAuth";

export class AccountStoreUnavailableError extends Error {
  readonly name = "AccountStoreUnavailableError";
}

export type AccountStore = {
  readonly syncUser: (
    principal: ResearchPrincipal,
    observedAt: string,
  ) => Promise<void>;
  readonly recordResearchRun: (
    principalId: string,
    run: PublicRun,
  ) => Promise<void>;
  readonly listResearchRuns?: (
    principalId: string,
    limit: number,
    cursor?: RunCursor,
  ) => Promise<readonly PublicRun[]>;
  readonly recordReportOwnership: (
    principalId: string,
    report: PublicReport,
  ) => Promise<void>;
  readonly recordConsultation?: (
    principalId: string,
    question: PublicQuestion,
  ) => Promise<void>;
  readonly listConsultations?: (
    principalId: string,
    reportId: string,
  ) => Promise<readonly PublicQuestion[]>;
  readonly close: () => Promise<void>;
};
