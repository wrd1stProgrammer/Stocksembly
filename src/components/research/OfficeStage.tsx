"use client";

import { useState } from "react";
import {
  type AppLocale,
  type ResearchLocale,
  researchCopy,
  uiMessage,
} from "../../lib/i18n";
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
  readonly locale: ResearchLocale;
  readonly uiLocale?: AppLocale;
  readonly isPaused: boolean;
  readonly isComplete: boolean;
  readonly company: import("../../research/types").ResearchCompany;
  readonly report: ResearchFileData;
  readonly reportVersion: number;
  readonly reportId?: string;
  readonly activeAgentIds: readonly AgentId[];
  readonly focusedTeam?: boolean;
  readonly hideCompleteHeadingLabel?: boolean;
  readonly onReplay: () => void;
};

export function OfficeStage({
  current,
  events = [current],
  snapshot,
  renderPreviousSnapshot,
  renderInterpolationAlpha,
  locale,
  uiLocale = locale,
  isPaused,
  isComplete,
  company,
  report,
  reportVersion,
  reportId,
  activeAgentIds,
  focusedTeam = false,
  hideCompleteHeadingLabel = false,
  onReplay,
}: Props) {
  const labels = researchCopy[locale];
  const [cameraControlMode, setCameraControlMode] =
    useState<OfficeCameraControlMode>("automatic");
  const cameraModes: readonly {
    readonly id: OfficeCameraControlMode;
    readonly label: Parameters<typeof uiMessage>[1];
  }[] = [
    {
      id: "automatic",
      label: { en: "AUTO", ko: "자동", ja: "自動", "zh-TW": "自動" },
    },
    {
      id: "free",
      label: { en: "FREE", ko: "자유", ja: "自由", "zh-TW": "自由" },
    },
    {
      id: "overview",
      label: { en: "FULL", ko: "전체", ja: "全体", "zh-TW": "全景" },
    },
  ];
  return (
    <main className={`office-workbench${isComplete ? " is-complete" : ""}`}>
      <div className="office-heading">
        <h2 id="office-stage-title" className="sr-only">
          {labels.aria.stage}
        </h2>
        {isComplete && hideCompleteHeadingLabel ? null : (
          <span className="office-heading__label">
            {isComplete
              ? uiMessage(uiLocale, {
                  en: "FINAL RESEARCH REPORT",
                  ko: "최종 리서치 리포트",
                  ja: "最終リサーチレポート",
                  "zh-TW": "最終研究報告",
                  es: "INFORME FINAL",
                  "pt-BR": "RELATÓRIO FINAL",
                  de: "FINALER RESEARCH-BERICHT",
                  fr: "RAPPORT FINAL",
                })
              : uiMessage(uiLocale, {
                  en: "LIVE RESEARCH ROOM",
                  ko: "실시간 리서치 룸",
                  ja: "ライブリサーチルーム",
                  "zh-TW": "即時研究室",
                  es: "SALA DE INVESTIGACIÓN EN VIVO",
                  "pt-BR": "SALA DE PESQUISA AO VIVO",
                  de: "LIVE RESEARCH-RAUM",
                  fr: "SALLE DE RECHERCHE EN DIRECT",
                })}
          </span>
        )}
        {isComplete ? null : (
          <fieldset className="office-camera-modes">
            <legend className="sr-only">
              {uiMessage(uiLocale, {
                en: "Camera movement mode",
                ko: "카메라 무빙 모드",
                ja: "カメラ移動モード",
                "zh-TW": "鏡頭移動模式",
              })}
            </legend>
            {cameraModes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                aria-pressed={cameraControlMode === mode.id}
                title={
                  mode.id === "free"
                    ? uiMessage(uiLocale, {
                        en: "Drag to move and pinch to zoom",
                        ko: "드래그로 이동하고 핀치로 확대·축소",
                        ja: "ドラッグで移動、ピンチで拡大・縮小",
                        "zh-TW": "拖曳移動，雙指縮放",
                      })
                    : undefined
                }
                onClick={() => setCameraControlMode(mode.id)}
              >
                {uiMessage(uiLocale, mode.label)}
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
            cameraMode={focusedTeam ? "focus" : "overview"}
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
              {uiMessage(uiLocale, {
                en: "MARKET",
                ko: "시장",
                ja: "市場",
                "zh-TW": "市場",
              })}
            </span>
            <span data-room="chair">
              {uiMessage(uiLocale, {
                en: "RESEARCH CHAIR",
                ko: "리서치 의장",
                ja: "リサーチ議長",
                "zh-TW": "研究主席",
              })}
            </span>
            <span data-room="company">
              {uiMessage(uiLocale, {
                en: "COMPANY",
                ko: "기업",
                ja: "企業",
                "zh-TW": "公司",
              })}
            </span>
            <span data-room="financial">
              {uiMessage(uiLocale, {
                en: "FINANCIAL",
                ko: "재무",
                ja: "財務",
                "zh-TW": "財務",
              })}
            </span>
            <span data-room="risk">
              {uiMessage(uiLocale, {
                en: "RISK",
                ko: "리스크",
                ja: "リスク",
                "zh-TW": "風險",
              })}
            </span>
          </div>
        </section>
      )}
      {isComplete ? null : (
        <p className="research-continuity-note">
          <i aria-hidden="true" />
          {uiMessage(uiLocale, {
            en: "Research continues even when you leave this screen.",
            ko: "화면을 나가도 리서치는 계속됩니다.",
            ja: "画面を離れてもリサーチは続行されます。",
            "zh-TW": "離開此畫面後，研究仍會繼續。",
            es: "La investigación continúa aunque salgas de esta pantalla.",
            "pt-BR": "A pesquisa continua mesmo após sair desta tela.",
            de: "Die Recherche läuft weiter, auch wenn Sie diese Ansicht verlassen.",
            fr: "La recherche continue même si vous quittez cet écran.",
          })}
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
