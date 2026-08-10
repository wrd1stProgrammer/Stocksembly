"use client";

import { useState } from "react";
import { type Locale, researchCopy } from "../../lib/i18n";
import type { ResearchFileData } from "../../research/compositions/types";
import type { OfficeCameraControlMode } from "../../research/officeGame";
import type { OfficeSimulationSnapshot } from "../../research/officeSimulation";
import type { AgentId, ResearchEvent } from "../../research/types";
import { CompletedResearchFile } from "./CompletedResearchFile";
import { PixelOfficeGame } from "./PixelOfficeGame";

type Props = {
  readonly current: ResearchEvent;
  readonly events?: readonly ResearchEvent[];
  readonly snapshot?: OfficeSimulationSnapshot;
  readonly renderPreviousSnapshot?: OfficeSimulationSnapshot;
  readonly renderInterpolationAlpha?: number;
  readonly locale: Locale;
  readonly isPaused: boolean;
  readonly isComplete: boolean;
  readonly company: import("../../research/types").ResearchCompany;
  readonly report: ResearchFileData;
  readonly reportVersion: number;
  readonly reportId?: string;
  readonly activeAgentIds: readonly AgentId[];
  readonly onReplay: () => void;
};

export function OfficeStage({
  current,
  events = [current],
  snapshot,
  renderPreviousSnapshot,
  renderInterpolationAlpha,
  locale,
  isPaused,
  isComplete,
  company,
  report,
  reportVersion,
  reportId,
  activeAgentIds,
  onReplay,
}: Props) {
  const labels = researchCopy[locale];
  const [cameraControlMode, setCameraControlMode] =
    useState<OfficeCameraControlMode>("automatic");
  const cameraModes: readonly {
    readonly id: OfficeCameraControlMode;
    readonly ko: string;
    readonly en: string;
  }[] = [
    { id: "automatic", ko: "자동", en: "AUTO" },
    { id: "free", ko: "자유", en: "FREE" },
    { id: "overview", ko: "전체", en: "FULL" },
  ];
  return (
    <main className={`office-workbench${isComplete ? " is-complete" : ""}`}>
      <div className="office-heading">
        <h2 id="office-stage-title" className="sr-only">
          {labels.aria.stage}
        </h2>
        <span className="office-heading__label">
          {isComplete
            ? locale === "ko"
              ? "최종 리서치 리포트"
              : "FINAL RESEARCH REPORT"
            : locale === "ko"
              ? "실시간 리서치 룸"
              : "LIVE RESEARCH ROOM"}
        </span>
        {isComplete ? null : (
          <fieldset className="office-camera-modes">
            <legend className="sr-only">
              {locale === "ko" ? "카메라 무빙 모드" : "Camera movement mode"}
            </legend>
            {cameraModes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                aria-pressed={cameraControlMode === mode.id}
                title={
                  mode.id === "free"
                    ? locale === "ko"
                      ? "드래그로 이동하고 핀치로 확대·축소"
                      : "Drag to move and pinch to zoom"
                    : undefined
                }
                onClick={() => setCameraControlMode(mode.id)}
              >
                {mode[locale]}
              </button>
            ))}
          </fieldset>
        )}
      </div>
      {isComplete ? null : (
        <section
          className={`office-stage phase-${current.phase}${isPaused ? " is-paused" : ""}`}
          data-office-tick={snapshot?.tick}
          data-office-beat={snapshot?.beatId}
          data-camera-mode={cameraControlMode}
          aria-labelledby="office-stage-title"
        >
          <PixelOfficeGame
            phase={current.phase}
            currentEvent={current}
            events={events}
            {...(snapshot ? { snapshot } : {})}
            {...(renderPreviousSnapshot ? { renderPreviousSnapshot } : {})}
            {...(renderInterpolationAlpha !== undefined
              ? { renderInterpolationAlpha }
              : {})}
            locale={locale}
            isPaused={isPaused}
            activeAgentIds={activeAgentIds}
            cameraMode="overview"
            cameraControlMode={cameraControlMode}
          />
          <p
            className="sr-only"
            data-testid="office-semantic-summary"
            aria-live="polite"
          >
            {current.summary[locale]}
          </p>
          <div className="office-stage__shade" />
          <div className="office-stage__department-labels" aria-hidden="true">
            <span data-room="market">
              {locale === "ko" ? "시장" : "MARKET"}
            </span>
            <span data-room="chair">
              {locale === "ko" ? "리서치 의장" : "RESEARCH CHAIR"}
            </span>
            <span data-room="company">
              {locale === "ko" ? "기업" : "COMPANY"}
            </span>
            <span data-room="financial">
              {locale === "ko" ? "재무" : "FINANCIAL"}
            </span>
            <span data-room="risk">{locale === "ko" ? "리스크" : "RISK"}</span>
          </div>
        </section>
      )}
      {isComplete ? null : (
        <p className="research-continuity-note">
          <i aria-hidden="true" />
          {locale === "ko"
            ? "화면을 나가도 리서치는 계속됩니다."
            : "Research continues even when you leave this screen."}
        </p>
      )}
      {isComplete ? (
        <CompletedResearchFile
          company={company}
          report={report}
          locale={locale}
          version={reportVersion}
          {...(reportId === undefined ? {} : { reportId })}
          onReplay={onReplay}
        />
      ) : null}
    </main>
  );
}
