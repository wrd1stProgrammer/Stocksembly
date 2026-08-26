"use client";

import { ArrowLeft, Languages, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  type AppLocale,
  type ResearchLocale,
  researchLocale,
} from "../../lib/i18n";
import type { PublicRunDetail } from "../../research/client/schemas";
import type { ResearchFileData } from "../../research/compositions/types";
import { liveOfficeProjection } from "../../research/liveOfficeProjection";
import { agents } from "../../research/mockResearch";
import { OFFICE_SCENE_MANIFEST } from "../../research/officeSceneManifest";
import type { ResearchCompany } from "../../research/types";
import { CreditShortageModal } from "../billing/CreditShortageModal";
import {
  MeetingMinutes,
  type ResearchConversationEntry,
} from "../research/MeetingMinutes";
import { OfficeStage } from "../research/OfficeStage";
import { researchRoomUiCopy } from "./researchRoomCopy";

type Props = {
  readonly accessAuthenticated: boolean;
  readonly company: ResearchCompany;
  readonly conversation: readonly ResearchConversationEntry[];
  readonly file: ResearchFileData;
  readonly locale: AppLocale;
  readonly originalQuestion: string;
  readonly reportId: string;
  readonly sourceLocale: ResearchLocale;
  readonly runDetail: PublicRunDetail;
  readonly version: number;
};

export function PublishedResearchWorkspace({
  accessAuthenticated,
  company,
  conversation,
  file,
  locale,
  originalQuestion,
  reportId,
  sourceLocale,
  runDetail,
  version,
}: Props) {
  const roomCopy = researchRoomUiCopy[locale];
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [presentedFile, setPresentedFile] = useState(file);
  const [presentedQuestion, setPresentedQuestion] = useState(originalQuestion);
  const [presentedRunDetail, setPresentedRunDetail] = useState(runDetail);
  const [presentedConversation, setPresentedConversation] =
    useState(conversation);
  const [contentLocale, setContentLocale] =
    useState<ResearchLocale>(sourceLocale);
  const [translatedTargetLocale, setTranslatedTargetLocale] =
    useState<AppLocale>();
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [creditShortage, setCreditShortage] = useState<{
    readonly remaining: number;
    readonly required: number;
  } | null>(null);
  const needsTranslation =
    sourceLocale !== locale && translatedTargetLocale !== locale;
  const projection = useMemo(
    () => liveOfficeProjection(presentedRunDetail),
    [presentedRunDetail],
  );
  const visibleAgents = useMemo(() => {
    const target = presentedRunDetail.run.researchTarget;
    if (target?.kind !== "department") return agents;
    const memberIds = new Set<string>(
      OFFICE_SCENE_MANIFEST.departments[target.departmentId]?.memberIds ?? [],
    );
    return agents.filter((agent) => memberIds.has(agent.id));
  }, [presentedRunDetail.run.researchTarget]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  async function translateReport() {
    if (translating || !needsTranslation) return;
    setTranslating(true);
    setTranslationError(null);
    try {
      const response = await fetch(
        `/api/research-room/${encodeURIComponent(reportId)}/translation`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ targetLocale: locale }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        readonly error?: string;
        readonly file?: ResearchFileData;
        readonly question?: string;
        readonly runDetail?: PublicRunDetail;
        readonly conversation?: readonly ResearchConversationEntry[];
        readonly renderLocale?: ResearchLocale;
        readonly remaining?: number;
        readonly required?: number;
      };
      if (response.status === 401) {
        setTranslationError(roomCopy.signInToTranslate);
        return;
      }
      if (response.status === 402) {
        setCreditShortage({
          remaining: payload.remaining ?? 0,
          required: payload.required ?? 1,
        });
        return;
      }
      if (
        !response.ok ||
        payload.file === undefined ||
        payload.runDetail === undefined ||
        payload.conversation === undefined ||
        payload.renderLocale === undefined
      )
        throw new Error(payload.error ?? "TRANSLATION_FAILED");
      setPresentedFile(payload.file);
      setPresentedRunDetail(payload.runDetail);
      setPresentedConversation(payload.conversation);
      if (payload.question !== undefined)
        setPresentedQuestion(payload.question);
      setContentLocale(payload.renderLocale);
      setTranslatedTargetLocale(locale);
    } catch {
      setTranslationError(roomCopy.translationFailed);
    } finally {
      setTranslating(false);
    }
  }

  return (
    <div
      className="research-shell public-research-workspace"
      lang={locale}
      data-research-mode="published-room"
      data-research-state="published"
      data-sidebar-open="false"
      data-transcript-open={transcriptOpen ? "true" : "false"}
    >
      <div className="public-research-workspace__toolbar">
        <Link
          className="public-research-workspace__back"
          href={`/research-room?lang=${locale}`}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {roomCopy.back}
        </Link>
        {sourceLocale === locale ? null : (
          <button
            type="button"
            className="public-research-workspace__translate"
            disabled={translating || !needsTranslation}
            onClick={() => void translateReport()}
          >
            {translating ? (
              <LoaderCircle
                className="is-spinning"
                size={15}
                aria-hidden="true"
              />
            ) : (
              <Languages size={15} aria-hidden="true" />
            )}
            {translatedTargetLocale === locale
              ? roomCopy.translated
              : roomCopy.professionalTranslation}
          </button>
        )}
        {translationError === null ? null : (
          <p
            className="public-research-workspace__translation-error"
            role="status"
          >
            {translationError}
          </p>
        )}
      </div>
      <div className="research-layout">
        <OfficeStage
          current={projection.current}
          events={projection.events}
          locale={contentLocale}
          uiLocale={locale}
          isPaused={false}
          isComplete
          company={company}
          report={presentedFile}
          reportVersion={version}
          reportId={reportId}
          activeAgentIds={[]}
          onReplay={() => {
            window.location.assign(`/research-room?lang=${locale}`);
          }}
        />
        <MeetingMinutes
          current={projection.current}
          agents={visibleAgents}
          events={projection.events}
          locale={contentLocale}
          uiLocale={locale}
          isComplete
          reportId={reportId}
          reportVersion={version}
          questionsEnabled
          chatEnabled={accessAuthenticated}
          loadChatHistory={false}
          originalQuestion={presentedQuestion}
          conversation={presentedConversation}
          panelOpen={transcriptOpen}
          onPanelToggle={() => setTranscriptOpen((open) => !open)}
        />
      </div>
      <CreditShortageModal
        locale={researchLocale(locale)}
        open={creditShortage !== null}
        {...(creditShortage === null
          ? {}
          : {
              remaining: creditShortage.remaining,
              required: creditShortage.required,
            })}
        onClose={() => setCreditShortage(null)}
      />
    </div>
  );
}
