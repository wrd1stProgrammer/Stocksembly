"use client";

import { ArrowLeft, Languages, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Locale } from "../../lib/i18n";
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

type Props = {
  readonly accessAuthenticated: boolean;
  readonly company: ResearchCompany;
  readonly conversation: readonly ResearchConversationEntry[];
  readonly file: ResearchFileData;
  readonly locale: Locale;
  readonly originalQuestion: string;
  readonly reportId: string;
  readonly sourceLocale: Locale;
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
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [presentedFile, setPresentedFile] = useState(file);
  const [presentedQuestion, setPresentedQuestion] = useState(originalQuestion);
  const [presentedLocale, setPresentedLocale] = useState(sourceLocale);
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [creditShortage, setCreditShortage] = useState<{
    readonly remaining: number;
    readonly required: number;
  } | null>(null);
  const needsTranslation =
    sourceLocale !== locale && presentedLocale !== locale;
  const projection = useMemo(
    () => liveOfficeProjection(runDetail),
    [runDetail],
  );
  const visibleAgents = useMemo(() => {
    const target = runDetail.run.researchTarget;
    if (target?.kind !== "department") return agents;
    const memberIds = new Set<string>(
      OFFICE_SCENE_MANIFEST.departments[target.departmentId]?.memberIds ?? [],
    );
    return agents.filter((agent) => memberIds.has(agent.id));
  }, [runDetail.run.researchTarget]);

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
        readonly remaining?: number;
        readonly required?: number;
      };
      if (response.status === 401) {
        setTranslationError(
          locale === "ko"
            ? "전문 번역은 로그인 후 이용할 수 있습니다."
            : "Sign in to use professional translation.",
        );
        return;
      }
      if (response.status === 402) {
        setCreditShortage({
          remaining: payload.remaining ?? 0,
          required: payload.required ?? 1,
        });
        return;
      }
      if (!response.ok || payload.file === undefined)
        throw new Error(payload.error ?? "TRANSLATION_FAILED");
      setPresentedFile(payload.file);
      if (payload.question !== undefined)
        setPresentedQuestion(payload.question);
      setPresentedLocale(locale);
    } catch {
      setTranslationError(
        locale === "ko"
          ? "번역을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요."
          : "Translation could not be completed. Please try again shortly.",
      );
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
          {locale === "ko" ? "리서치룸" : "Research room"}
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
            {presentedLocale === locale
              ? locale === "ko"
                ? "번역 완료"
                : "Translated"
              : locale === "ko"
                ? "전문 번역 · 1 크레딧"
                : "Professional translation · 1 credit"}
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
          locale={presentedLocale}
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
          locale={presentedLocale}
          isComplete
          reportId={reportId}
          reportVersion={version}
          questionsEnabled
          chatEnabled={accessAuthenticated}
          loadChatHistory={false}
          originalQuestion={presentedQuestion}
          conversation={conversation}
          panelOpen={transcriptOpen}
          onPanelToggle={() => setTranscriptOpen((open) => !open)}
        />
      </div>
      <CreditShortageModal
        locale={locale}
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
