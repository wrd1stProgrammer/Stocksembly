"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Locale } from "../../lib/i18n";
import type { PublicRunDetail } from "../../research/client/schemas";
import type { ResearchFileData } from "../../research/compositions/types";
import { liveOfficeProjection } from "../../research/liveOfficeProjection";
import { agents } from "../../research/mockResearch";
import { OFFICE_SCENE_MANIFEST } from "../../research/officeSceneManifest";
import type { ResearchCompany } from "../../research/types";
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
  runDetail,
  version,
}: Props) {
  const [transcriptOpen, setTranscriptOpen] = useState(true);
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

  return (
    <div
      className="research-shell public-research-workspace"
      lang={locale}
      data-research-mode="published-room"
      data-research-state="published"
      data-sidebar-open="false"
      data-transcript-open={transcriptOpen ? "true" : "false"}
    >
      <Link
        className="public-research-workspace__back"
        href={`/research-room?lang=${locale}`}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        {locale === "ko" ? "리서치룸" : "Research room"}
      </Link>
      <div className="research-layout">
        <OfficeStage
          current={projection.current}
          events={projection.events}
          locale={locale}
          isPaused={false}
          isComplete
          company={company}
          report={file}
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
          locale={locale}
          isComplete
          reportId={reportId}
          reportVersion={version}
          questionsEnabled
          chatEnabled={accessAuthenticated}
          loadChatHistory={false}
          originalQuestion={originalQuestion}
          conversation={conversation}
          panelOpen={transcriptOpen}
          onPanelToggle={() => setTranscriptOpen((open) => !open)}
        />
      </div>
    </div>
  );
}
