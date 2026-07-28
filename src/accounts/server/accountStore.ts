import type {
  PublicReport,
  PublicRun,
} from "../../research/server/api/researchApiContracts";
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
  readonly recordReportOwnership: (
    principalId: string,
    report: PublicReport,
  ) => Promise<void>;
  readonly close: () => Promise<void>;
};
