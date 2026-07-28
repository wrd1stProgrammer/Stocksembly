"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createAuthenticatedResearchClient } from "../../auth/researchClient";
import type { Locale } from "../../lib/i18n";
import { ResearchRequestError } from "../../research/client/api";
import { Brand } from "../Brand";

type Props = {
  readonly symbol: string;
  readonly question: string;
  readonly locale: Locale;
  readonly idempotencyKey: string;
};

export function LaunchingResearchRoom({
  symbol,
  question,
  locale,
  idempotencyKey,
}: Props) {
  const router = useRouter();
  const client = useMemo(() => createAuthenticatedResearchClient(), []);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void client
      .startRun({ symbol, question, locale, idempotencyKey })
      .then((created) => {
        if (!active) return;
        router.replace(
          `/research/${symbol}?run=${created.run.runId}&lang=${locale}`,
        );
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ResearchRequestError && error.status === 401) {
          router.replace(
            `/login?next=${encodeURIComponent(`/?lang=${locale}#research`)}`,
          );
          return;
        }
        setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [client, idempotencyKey, locale, question, router, symbol]);

  const copy =
    locale === "ko"
      ? {
          stage: "리서치 룸 입장",
          title: `${symbol} 분석팀을 연결하고 있습니다`,
          body: "실행 정보가 준비되는 동안 조사실과 회의 기록을 불러옵니다.",
          side: "에이전트 배정 중",
          failed:
            "분석팀 연결에 실패했습니다. 홈으로 돌아가 다시 시도해 주세요.",
          home: "홈으로 돌아가기",
        }
      : {
          stage: "ENTERING RESEARCH ROOM",
          title: `Connecting the ${symbol} research team`,
          body: "The research office and durable meeting record are loading while the run is prepared.",
          side: "Assigning agents",
          failed: "The research team could not be connected. Please try again.",
          home: "Return home",
        };

  return (
    <div className="research-shell research-launch-shell" lang={locale}>
      <aside className="research-launch-shell__rail">
        <Brand locale={locale} />
        <div>
          <span>{symbol}</span>
          <small>{copy.side}</small>
        </div>
      </aside>
      <main className="research-launch-shell__main" aria-live="polite">
        <span>{copy.stage}</span>
        <div className="research-launch-shell__pulse" aria-hidden="true" />
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        {question.trim().length === 0 ? null : (
          <blockquote>“{question}”</blockquote>
        )}
        {failed ? (
          <div role="alert">
            <p>{copy.failed}</p>
            <a href="/">{copy.home}</a>
          </div>
        ) : null}
      </main>
      <aside className="research-launch-shell__minutes">
        <strong>{locale === "ko" ? "회의록" : "MEETING LOG"}</strong>
        <span>{copy.side}</span>
        <i />
        <i />
        <i />
      </aside>
    </div>
  );
}
