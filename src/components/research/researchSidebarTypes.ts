import type { Locale } from "../../lib/i18n";
import type { ResearchHistoryGroup } from "../../research/compositions/types";
import type {
  AgentId,
  AgentProfile,
  ResearchCompany,
} from "../../research/types";

export type ResearchSidebarProps = {
  readonly company: ResearchCompany;
  readonly agents: readonly AgentProfile[];
  readonly defaultAgentIds: readonly AgentId[];
  readonly history: readonly ResearchHistoryGroup[];
  readonly locale: Locale;
  readonly collapsed: boolean;
  readonly onCollapsedChange: (collapsed: boolean) => void;
  readonly onLocaleChange: (locale: Locale) => void;
};
