import {
  Buildings,
  CheckCircle,
  CircleNotch,
  MagnifyingGlass,
  WarningCircle,
} from "@phosphor-icons/react";
import Image from "next/image";
import type { Locale } from "../../lib/i18n";
import { AGENT_IDS } from "../../research/officeSceneManifest";
import type { OfficeSimulationSnapshot } from "../../research/officeSimulation";
import type {
  AgentId,
  AgentProfile,
  ResearchCompany,
  ResearchEvent,
} from "../../research/types";

type Props = {
  readonly agents: readonly AgentProfile[];
  readonly company: ResearchCompany;
  readonly current: ResearchEvent;
  readonly snapshot?: OfficeSimulationSnapshot;
  readonly activeAgentIds: readonly AgentId[];
  readonly walkingAgentIds: readonly AgentId[];
  readonly completedAgentIds: readonly AgentId[];
  readonly locale: Locale;
};

export function DepartmentRail({
  agents,
  company,
  current,
  snapshot,
  activeAgentIds,
  walkingAgentIds,
  completedAgentIds,
  locale,
}: Props) {
  const activeAgents = new Set(activeAgentIds);
  const walkingAgents = new Set(walkingAgentIds);
  const completedAgents = new Set(completedAgentIds);
  return (
    <aside
      className="department-rail"
      aria-label={locale === "ko" ? "분석 부서" : "Research departments"}
    >
      <section className="company-brief">
        <div className="company-brief__mark">
          <Buildings size={24} weight="duotone" />
        </div>
        <div>
          <span>{company.exchange}</span>
          <h1>{company.symbol}</h1>
          <p>{company.company}</p>
        </div>
        <strong>{company.price}</strong>
        <small
          className={
            company.change.startsWith("+") ? "is-positive" : "is-negative"
          }
        >
          {company.change}
        </small>
        <footer>
          {company.marketStatus[locale]}
          <br />
          {company.sector}
        </footer>
      </section>
      <div className="department-rail__heading">
        <span>{locale === "ko" ? "분석팀" : "ANALYSIS TEAM"}</span>
        <em>{AGENT_IDS.length}</em>
      </div>
      <ol className="agent-list">
        {agents.map((agent) => {
          const isActive = activeAgents.has(agent.id);
          const isWalking = walkingAgents.has(agent.id);
          const isDone =
            !isWalking &&
            (current.phase === "complete" || completedAgents.has(agent.id));
          const state = isWalking
            ? "reviewing"
            : isDone
              ? "complete"
              : !isActive
                ? "queued"
                : current.phase === "challenging"
                  ? "challenged"
                  : current.phase === "auditing" ||
                      current.phase === "committee"
                    ? "reviewing"
                    : "working";
          const stateLabel =
            locale === "ko"
              ? {
                  queued: "대기",
                  working: "작업 중",
                  reviewing: isWalking ? "회의실 이동" : "검토 중",
                  complete: "완료",
                  challenged: "반론 중",
                }[state]
              : {
                  queued: "Queued",
                  working: "Working",
                  reviewing: isWalking ? "Walking to meeting" : "Reviewing",
                  complete: "Complete",
                  challenged: "Challenged",
                }[state];
          const agentProgress = isDone ? 100 : isActive ? current.progress : 0;
          return (
            <li
              key={agent.id}
              className={`state-${state}`}
              data-department={agent.departmentId}
              data-actor-id={agent.id}
              data-snapshot-tick={snapshot?.tick}
            >
              <Image src={agent.image} alt="" width={21} height={52} />
              <div>
                <strong>{agent.name[locale]}</strong>
                <span>{agent.role[locale]}</span>
                <small>{stateLabel}</small>
                <progress max={100} value={agentProgress}>
                  {agentProgress}%
                </progress>
              </div>
              {isDone ? (
                <CheckCircle size={17} weight="fill" />
              ) : isActive ? (
                state === "challenged" ? (
                  <WarningCircle size={17} weight="fill" />
                ) : state === "reviewing" ? (
                  <MagnifyingGlass size={17} />
                ) : (
                  <CircleNotch className="spin" size={17} />
                )
              ) : (
                <i />
              )}
            </li>
          );
        })}
      </ol>
      <section className="rail-note">
        <span>{locale === "ko" ? "리서치 원칙" : "RESEARCH STANDARD"}</span>
        <p>
          {locale === "ko"
            ? "출처 없는 주장은 최종 리포트에 포함하지 않습니다."
            : "No material claim enters the report without a source."}
        </p>
      </section>
    </aside>
  );
}
