import { notFound } from "next/navigation";
import { CalibrationSurface } from "../../../src/research/compositions/calibration";
import "../../../src/styles/office-calibration.css";

export const dynamic = "force-dynamic";

export default function OfficeCalibrationPage() {
  const { OFFICE_CALIBRATION } = process.env;
  if (process.env.NODE_ENV === "production" && OFFICE_CALIBRATION !== "1") {
    notFound();
  }
  return <CalibrationSurface />;
}
