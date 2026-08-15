import type { ResearchLocale } from "../lib/i18n";
import type { ResearchEventWithMode } from "./compositionMode";
import type { OfficeBeatId, OfficePublicEventKind } from "./officeChoreography";
import type { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";
import type { OfficeSimulationSnapshot } from "./officeSimulation";

export type ResearchPhase =
  | "briefing"
  | "collecting"
  | "analyzing"
  | "challenging"
  | "auditing"
  | "gathering"
  | "committee"
  | "complete";

export type AgentId = (typeof OFFICE_SCENE_MANIFEST.roster)[number]["id"];

export type DepartmentId = keyof typeof OFFICE_SCENE_MANIFEST.departments;
export type OfficeAreaId =
  (typeof OFFICE_SCENE_MANIFEST.roster)[number]["departmentId"];

export type PanelTab = "activity" | "debate" | "sources";

export type ResearchEvent = {
  readonly id: string;
  readonly phase: ResearchPhase;
  readonly agent: AgentId;
  readonly summary: Readonly<Record<ResearchLocale, string>>;
  readonly detail: Readonly<Record<ResearchLocale, string>>;
  readonly source?: string;
  readonly progress: number;
  readonly tick?: number;
  readonly kind?: OfficePublicEventKind;
  readonly workflowKind?: string;
  readonly participantIds?: readonly AgentId[];
};

export type AgentProfile = {
  readonly id: AgentId;
  readonly departmentId: OfficeAreaId;
  readonly representative: boolean;
  readonly name: Readonly<Record<ResearchLocale, string>>;
  readonly role: Readonly<Record<ResearchLocale, string>>;
  readonly specialty: Readonly<Record<ResearchLocale, string>>;
  readonly image: string;
  readonly spriteSheet: string;
};

export type ResearchDepartmentStatus = {
  readonly id: OfficeAreaId;
  readonly memberIds: readonly AgentId[];
  readonly representativeId: AgentId;
  readonly memberCount: number;
  readonly activeCount: number;
  readonly walkingCount: number;
  readonly completeCount: number;
  readonly status: "briefing" | "working" | "visiting" | "ready" | "forum";
};

export type ResearchVisitAnnotation = {
  readonly id: string;
  readonly phase: "visit-wave-a" | "visit-wave-b";
  readonly visitorId: AgentId;
  readonly hostId: AgentId;
  readonly active: boolean;
};

export type ResearchCompany = {
  readonly symbol: string;
  readonly company: string;
  readonly exchange: string;
  readonly sector: string;
  readonly price: string;
  readonly change: string;
  readonly marketStatus: Readonly<Record<ResearchLocale, string>>;
};

export type ResearchPlayback = {
  readonly index: number;
  readonly tick: number;
  readonly beatId: OfficeBeatId;
  readonly elapsedMs: number;
  readonly progress: number;
  readonly isPaused: boolean;
  readonly isComplete: boolean;
  readonly reportAvailable: boolean;
  readonly snapshot: OfficeSimulationSnapshot;
  readonly renderPreviousSnapshot: OfficeSimulationSnapshot;
  readonly renderInterpolationAlpha: number;
  readonly current: ResearchEventWithMode;
  readonly visibleEvents: readonly ResearchEventWithMode[];
  readonly publicLedger: readonly ResearchEventWithMode[];
  readonly activeAgentIds: readonly AgentId[];
  readonly walkingAgentIds: readonly AgentId[];
  readonly completedAgentIds: readonly AgentId[];
  readonly departmentStatuses: readonly ResearchDepartmentStatus[];
  readonly visitAnnotations: readonly ResearchVisitAnnotation[];
  readonly gatheringRepresentativeIds: readonly AgentId[];
  readonly gatheringNonRepresentativeIds: readonly AgentId[];
  readonly pause: () => void;
  readonly resume: () => void;
  readonly replay: () => void;
  readonly skip: () => void;
  readonly completeNow: () => void;
};
