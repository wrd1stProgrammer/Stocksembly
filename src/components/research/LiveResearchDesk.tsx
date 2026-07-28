import type { Locale } from "../../lib/i18n";
import { phaseLabels } from "../../research/mockResearch";
import { OFFICE_SCENE_MANIFEST } from "../../research/officeSceneManifest";
import type { ResearchEvent } from "../../research/types";

type Props = {
  readonly current: ResearchEvent;
  readonly locale: Locale;
};

const copy = {
  en: {
    eyebrow: "LIVE RESEARCH DESK",
    current: "Latest committed finding",
    progress: "Workflow progress",
    event: "Durable event",
    owner: "Current owner",
  },
  ko: {
    eyebrow: "LIVE RESEARCH DESK",
    current: "최근 커밋된 조사 결과",
    progress: "워크플로 진행률",
    event: "내구성 이벤트",
    owner: "현재 담당자",
  },
} as const;

function pendingWork(event: ResearchEvent, locale: Locale): string | undefined {
  switch (event.workflowKind) {
    case "structural_audit_completed":
      return locale === "ko"
        ? "주장과 근거의 의미 일치 여부를 교차 검증하고 있습니다."
        : "Cross-checking whether every material claim is entailed by its evidence.";
    case "semantic_audit_committed":
      return locale === "ko"
        ? "4개 팀의 최종 투표와 보존된 이견을 위원회 안건으로 정리하고 있습니다."
        : "Preparing four team ballots and preserved dissent for committee review.";
    case "committee_classified":
      return locale === "ko"
        ? "리서치 의장이 핵심 판단과 변경 조건을 편집하고 있습니다."
        : "The research chair is composing the decision and change conditions.";
    case "chair_synthesis_committed":
      return locale === "ko"
        ? "최종 리서치 파일과 다운로드용 PDF를 발행하고 있습니다."
        : "Publishing the final Research File and downloadable PDF.";
    default:
      return undefined;
  }
}

function usefulDetail(event: ResearchEvent, locale: Locale): string {
  const detail = event.detail[locale];
  if (
    /(?:Committed event|커밋 이벤트)\s*#?\d+/iu.test(detail) ||
    /durable public events?/iu.test(detail)
  ) {
    return phaseLabels[event.phase][locale];
  }
  return detail;
}

export function LiveResearchDesk({ current, locale }: Props) {
  const labels = copy[locale];
  const owner =
    OFFICE_SCENE_MANIFEST.roster.find((member) => member.id === current.agent)
      ?.name[locale] ?? current.agent;
  const phase = phaseLabels[current.phase][locale];
  const pending = pendingWork(current, locale);
  return (
    <section className="live-research-desk" aria-labelledby="live-desk-title">
      <div className="live-research-desk__brief">
        <span id="live-desk-title">{labels.eyebrow}</span>
        <small>{labels.current}</small>
        <strong>{current.summary[locale]}</strong>
        <p>{pending ?? usefulDetail(current, locale)}</p>
      </div>

      <div className="live-research-desk__signals">
        <small>{labels.progress}</small>
        <ul>
          <li>
            <i data-team={current.agent} />
            {current.progress}%
          </li>
        </ul>
      </div>

      <div className="live-research-desk__queue">
        <small>{labels.event}</small>
        <strong>{current.id}</strong>
        <span>
          {labels.owner}: {owner}
        </span>
        <div>
          <small>{phase}</small>
          <p>{phase}</p>
        </div>
      </div>
    </section>
  );
}
