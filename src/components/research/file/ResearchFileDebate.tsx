import Image from "next/image";
import type { Locale } from "../../../lib/i18n";
import type { ResearchFileData } from "../../../research/compositions/types";
import type { ResearchFileEditorialModel } from "../../../research/researchFileEditorialModel";
import { ResearchFileSectionHeader } from "./ResearchFilePrimitives";

const voteLabels = {
  support: { en: "Support", ko: "지지" },
  support_with_reservations: { en: "Qualified", ko: "조건부 지지" },
  oppose: { en: "Oppose", ko: "반대" },
  abstain: { en: "Abstain", ko: "유보" },
} as const;

function normalized(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
}

export function ResearchFileDebate({
  model,
  file,
  locale,
  number = "04",
}: {
  readonly model: ResearchFileEditorialModel;
  readonly file: ResearchFileData;
  readonly locale: Locale;
  readonly number?: "03" | "04";
}) {
  const ko = locale === "ko";
  const departmentId =
    file.researchTarget?.kind === "department"
      ? file.researchTarget.departmentId
      : undefined;
  const departmentReview = (() => {
    if (departmentId === undefined) return [];
    const seen = new Set([
      normalized(model.directAnswer),
      ...model.teamRows.flatMap((team) => [
        normalized(team.strongestClaim),
        normalized(team.evidence),
      ]),
    ]);
    const rows = [
      {
        label: ko ? "독립 검토" : "Independent review",
        value: model.initialView,
      },
      {
        label: ko ? "합의 후 결론" : "Consolidated view",
        value: model.finalView,
      },
      ...model.acceptedClaims.map((value) => ({
        label: ko ? "채택된 핵심 주장" : "Accepted claim",
        value,
      })),
      ...model.preservedDissent.map((value) => ({
        label: ko ? "보존된 이견" : "Preserved dissent",
        value,
      })),
    ];
    return rows.filter((row) => {
      const key = normalized(row.value);
      if (key.length === 0 || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();
  return (
    <section
      className="research-editorial-section"
      data-report-section="debate"
      id="team-debate"
    >
      <ResearchFileSectionHeader
        number={number}
        title={
          departmentId === undefined
            ? ko
              ? "에이전트 토론·최종 판정"
              : "Agent debate & final judgment"
            : ko
              ? "팀 내부 합의·보존된 이견"
              : "Team agreement & retained dissent"
        }
        description={
          departmentId !== undefined
            ? ko
              ? "팀원별 조사 결과에서 무엇을 채택했고 어떤 불확실성을 남겼는지 기록합니다."
              : "The record shows what the team retained from each specialist and which uncertainties remain."
            : ko
              ? "각 팀의 독립 판단과 최종 결론에 반영된 핵심 반론을 함께 보여줍니다."
              : "Independent team views are shown alongside the countercase carried into the final decision."
        }
      />
      <section className="research-team-table">
        <h3>
          {departmentId === undefined
            ? ko
              ? "팀별 독립 판단"
              : "Independent team views"
            : ko
              ? "선택 팀 합의문"
              : "Selected team consolidation"}
        </h3>
        <div className="research-team-table__head">
          <span>
            {departmentId === undefined
              ? ko
                ? "팀·최종 투표"
                : "Team & final vote"
              : ko
                ? "선택 팀·합의 상태"
                : "Selected team & agreement"}
          </span>
          <span>
            {departmentId === undefined
              ? ko
                ? "독립 결론"
                : "Independent conclusion"
              : ko
                ? "팀 합의 결론"
                : "Team conclusion"}
          </span>
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
            {departmentId !== undefined &&
            normalized(team.strongestClaim) ===
              normalized(model.directAnswer) ? null : (
              <p>{team.strongestClaim}</p>
            )}
            <p>{team.evidence}</p>
          </article>
        ))}
      </section>
      <section className="research-debate-records">
        <h3>
          {departmentId === undefined
            ? ko
              ? "최종 판단에 영향을 준 논쟁"
              : "Debates that changed the judgment"
            : ko
              ? "팀 합의에 영향을 준 내부 검토"
              : "Internal review that shaped the team view"}
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
                <dt>
                  {departmentId === undefined
                    ? ko
                      ? "의장 판정"
                      : "Chair ruling"
                    : ko
                      ? "팀 합의 반영"
                      : "Team resolution"}
                </dt>
                <dd>{debate.chairRuling}</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>
      {departmentId !== undefined && departmentReview.length === 0 ? null : (
        <section className="research-chair-ruling">
          <Image
            className="research-team-portrait"
            src={`/research/office-v7/portraits/${departmentId ?? "chair"}.png`}
            alt=""
            width={88}
            height={88}
          />
          <div>
            <span>
              {departmentId === undefined
                ? ko
                  ? "의장 최종 종합"
                  : "Chair synthesis"
                : ko
                  ? "팀 리드 최종 합의"
                  : "Team lead consolidation"}
            </span>
            {departmentId === undefined ? <h3>{model.directAnswer}</h3> : null}
          </div>
          <dl>
            {departmentId === undefined ? (
              <>
                <div>
                  <dt>
                    {departmentId === undefined
                      ? ko
                        ? "초기 판단"
                        : "Initial view"
                      : ko
                        ? "독립 검토"
                        : "Independent review"}
                  </dt>
                  <dd>{model.initialView}</dd>
                </div>
                <div>
                  <dt>
                    {departmentId === undefined
                      ? ko
                        ? "토론 후 판단"
                        : "Post-debate view"
                      : ko
                        ? "합의 후 결론"
                        : "Consolidated view"}
                  </dt>
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
              </>
            ) : (
              departmentReview.map((row) => (
                <div key={`${row.label}-${row.value}`}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))
            )}
          </dl>
        </section>
      )}
    </section>
  );
}
