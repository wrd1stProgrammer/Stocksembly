import { OfficeCalibration } from "../../components/research/OfficeCalibration";
import { assertSnapshotMode, type ResearchSnapshot } from "../compositionMode";

export const calibrationComposition = {
  name: "calibration" as const,
  mode: "calibration" as const,
  controls: "office-only" as const,
  Component: OfficeCalibration,
  openSnapshot(snapshot: ResearchSnapshot): ResearchSnapshot {
    return assertSnapshotMode("calibration", snapshot);
  },
};

export const CalibrationSurface = calibrationComposition.Component;
