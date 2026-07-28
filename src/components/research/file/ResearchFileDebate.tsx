import { DownloadSimple } from "@phosphor-icons/react";
import Image from "next/image";
import type { Locale } from "../../../lib/i18n";
import type { ResearchFileEditorialModel } from "../../../research/researchFileEditorialModel";
import { ResearchFileSectionHeader } from "./ResearchFilePrimitives";

const voteLabels = {
  support: { en: "Support", ko: "지지" },
  support_with_reservations: { en: "Qualified", ko: "조건부 지지" },
  oppose: { en: "Oppose", ko: "반대" },
  abstain: { en: "Abstain", ko: "유보" },
} as const;

function sourceClassLabel(sourceClass: string, locale: Locale): string {
  const labels: Readonly<
    Record<string, { readonly en: string; readonly ko: string }>
  > = {
    insightsentry_rapidapi: {
      en: "Licensed market data",
      ko: "라이선스 시장 데이터",
    },
    sec_primary_filing: { en: "SEC filing", ko: "SEC 공시" },
    sec_company_facts: { en: "SEC XBRL", ko: "SEC XBRL" },
    treasury_yield: { en: "Official macro data", ko: "공식 거시 데이터" },
  };
  return labels[sourceClass]?.[locale] ?? sourceClass.replaceAll("_", " ");
}

export function ResearchFileDebate({
  model,
  locale,
  version,
  reportId,
  onReplay,
}: {
  readonly model: ResearchFileEditorialModel;
  readonly locale: Locale;
  readonly version: number;
  readonly reportId?: string;
  readonly onReplay: () => void;
}) {
  const ko = locale === "ko";
  return (
    <section
      className="research-editorial-section"
      data-report-section="debate"
      id="team-debate"
    >
      <ResearchFileSectionHeader
        number="04"
        title={ko ? "에이전트 토론·최종 판정" : "Agent debate & final judgment"}
        description={
          ko
            ? "동일한 결론을 반복하지 않고, 반론이 최종 문장을 어떻게 바꿨는지 기록합니다."
            : "The record shows how counterarguments changed the final wording instead of repeating one conclusion."
        }
      />
      <section className="research-team-table">
        <h3>{ko ? "팀별 독립 판단" : "Independent team views"}</h3>
        <div className="research-team-table__head">
          <span>{ko ? "팀·최종 투표" : "Team & final vote"}</span>
          <span>{ko ? "독립 결론" : "Independent conclusion"}</span>
          <span>{ko ? "핵심 근거" : "Core rationale"}</span>
        </div>
        {model.teamRows.map((team) => (
          <article key={team.departmentId}>
            <div className="research-team-identity">
              <Image
                className="research-team-portrait"
                src={team.portraitPath}
                alt=""
                width={72}
                height={72}
              />
              <div>
                <h4>{team.teamName}</h4>
                <em data-vote={team.vote}>{voteLabels[team.vote][locale]}</em>
              </div>
            </div>
            <p>{team.strongestClaim}</p>
            <p>{team.evidence}</p>
          </article>
        ))}
      </section>
      <section className="research-debate-records">
        <h3>
          {ko
            ? "최종 판단에 영향을 준 논쟁"
            : "Debates that changed the judgment"}
        </h3>
        {model.debates.map((debate) => (
          <article key={debate.id}>
            <header>
              <span>{debate.id}</span>
              <h4>{debate.title}</h4>
            </header>
            <dl>
              <div>
                <dt>
                  {ko ? "주장" : "Claim"} · {debate.claimOwner}
                </dt>
                <dd>{debate.claim}</dd>
              </div>
              <div>
                <dt>
                  {ko ? "반론" : "Counterargument"} · {debate.counterOwner}
                </dt>
                <dd>{debate.counterargument}</dd>
              </div>
              <div>
                <dt>{ko ? "재검증 데이터" : "Rechecked evidence"}</dt>
                <dd>{debate.recheckedEvidence}</dd>
              </div>
              <div>
                <dt>{ko ? "의장 판정" : "Chair ruling"}</dt>
                <dd>{debate.chairRuling}</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>
      <section className="research-chair-ruling">
        <Image
          className="research-team-portrait"
          src="/research/office-v7/portraits/chair.png"
          alt=""
          width={88}
          height={88}
        />
        <div>
          <span>{ko ? "의장 최종 종합" : "Chair synthesis"}</span>
          <h3>{model.directAnswer}</h3>
        </div>
        <dl>
          <div>
            <dt>{ko ? "초기 판단" : "Initial view"}</dt>
            <dd>{model.initialView}</dd>
          </div>
          <div>
            <dt>{ko ? "토론 후 판단" : "Post-debate view"}</dt>
            <dd>{model.finalView}</dd>
          </div>
          <div>
            <dt>{ko ? "채택된 핵심 주장" : "Accepted claims"}</dt>
            <dd>{model.acceptedClaims.slice(0, 3).join(" · ")}</dd>
          </div>
          <div>
            <dt>{ko ? "보존된 이견" : "Preserved dissent"}</dt>
            <dd>{model.preservedDissent.slice(0, 3).join(" · ")}</dd>
          </div>
        </dl>
      </section>
      <section className="research-inline-evidence">
        <h3>{ko ? "근거 및 방법론" : "Evidence & methodology"}</h3>
        <p>
          {ko
            ? "주장 옆의 C 번호는 감사된 주장, 아래 S 번호는 연결된 공개 출처를 뜻합니다. 에이전트 해석과 원자료를 분리해 표시합니다."
            : "C references identify audited claims and S references identify linked public sources. Agent interpretation is kept separate from source evidence."}
        </p>
        <ol>
          {model.evidenceIndex.slice(0, 8).map((source) => (
            <li key={source.id}>
              <strong>{source.id}</strong>
              <span>{source.publisher}</span>
              <p>
                {source.url === undefined ? (
                  source.title
                ) : (
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                )}
              </p>
              <em>{sourceClassLabel(source.sourceClass, locale)}</em>
            </li>
          ))}
        </ol>
      </section>
      <footer className="completed-research-file__footer">
        <p>
          {ko
            ? `Research File v${version}.0 · 이 파일은 투자 권유나 목표가가 아닌 근거와 판단 조건의 기록입니다.`
            : `Research File v${version}.0 · This file records evidence and decision conditions; it is not a recommendation or price target.`}
        </p>
        <div>
          {reportId === undefined ? null : (
            <a
              href={`/api/research/reports/${reportId}/pdf?lang=${locale}`}
              download
            >
              <DownloadSimple size={17} aria-hidden="true" />
              {ko ? "PDF 다운로드" : "Download PDF"}
            </a>
          )}
          <button type="button" onClick={onReplay}>
            {ko ? "리서치 룸 다시 보기" : "Replay research room"}
          </button>
        </div>
      </footer>
    </section>
  );
}
