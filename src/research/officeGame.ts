import type { AppLocale, Locale } from "../lib/i18n";
import type { OfficeDialogue, OfficeDialogueChange } from "./officeDialogue";
import type { OfficeFurnitureRenderState } from "./officeGameFurniture";
import { createOfficeMotionRenderer } from "./officeMotion/controller";
import type {
  OfficeRendererCameraMode,
  OfficeRenderSnapshot,
} from "./officeRenderer";
import type { OfficeActorUiLayout } from "./officeRendererUiLayout";
import type { OfficeSimulationSnapshot } from "./officeSimulation";
import type { AgentId, AgentProfile } from "./types";

export {
  constrainFreeCamera,
  officeRendererResolution,
  zoomFreeCameraAt,
} from "./officeMotion/camera";

export type OfficeGameInspection = {
  readonly render: OfficeRenderSnapshot;
  readonly furniture: readonly OfficeFurnitureRenderState[];
  readonly ui: readonly OfficeActorUiLayout[];
};

export type OfficeCameraControlMode = "automatic" | "free" | "overview";

export type OfficeSnapshotRenderOptions = {
  readonly dialogue?: OfficeDialogue;
  readonly previousSnapshot?: OfficeSimulationSnapshot;
  readonly interpolation?: number;
  readonly cameraMode?: OfficeRendererCameraMode;
  readonly cameraActorIds?: readonly AgentId[];
  readonly liveBubble?: {
    readonly actorId: AgentId;
    readonly message: string;
  };
  readonly liveBubbles?: readonly {
    readonly actorId: AgentId;
    readonly message: string;
  }[];
  readonly conversation?: {
    readonly speakerId: AgentId;
    readonly participantIds: readonly AgentId[];
  };
};

export type OfficeGameController = {
  readonly renderSnapshot: (
    snapshot: OfficeSimulationSnapshot,
    options?: OfficeSnapshotRenderOptions,
  ) => OfficeRenderSnapshot;
  readonly setCameraMode: (mode: OfficeRendererCameraMode) => void;
  readonly setCameraControlMode: (mode: OfficeCameraControlMode) => void;
  readonly setBubbleTypingElapsed: (elapsedMs: number) => void;
  readonly inspect: () => OfficeGameInspection;
  readonly setPaused: (isPaused: boolean) => void;
  readonly destroy: () => void;
};

export type OfficeSnapshotRendererOptions = {
  readonly host: HTMLDivElement;
  readonly locale: AppLocale;
  readonly reducedMotion: boolean;
  readonly showActorUi?: boolean;
  readonly showActorBubbles?: boolean;
  readonly onActorSelect?: (actorId: AgentId) => void;
  readonly onDialogueChange?: (change: OfficeDialogueChange) => void;
  readonly signal: AbortSignal;
};

export const createOfficeSnapshotRenderer = createOfficeMotionRenderer;

export async function createOfficeGame(
  host: HTMLDivElement,
  profiles: readonly AgentProfile[],
  locale: Locale,
  reducedMotion: boolean,
  signal: AbortSignal,
): Promise<OfficeGameController> {
  void profiles;
  return createOfficeSnapshotRenderer({ host, locale, reducedMotion, signal });
}
