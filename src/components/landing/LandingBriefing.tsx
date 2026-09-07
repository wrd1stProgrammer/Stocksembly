"use client";

import { ArrowDown, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { AppLocale } from "../../lib/i18n";
import { BriefingDetailBody } from "../briefing/BriefingDetailBody";
import { briefingSample } from "./briefingSample";

export default function LandingBriefing({
  locale,
}: {
  readonly locale: AppLocale;
}) {
  const ko = locale === "ko";
  return (
    <section
      className="landing-daily landing-container"
      id="briefing"
      aria-labelledby="briefing-heading"
    >
      <div className="landing-section-heading">
        <div>
          <span className="landing-kicker">THE BRIEFING ROOM</span>
          <h2 id="briefing-heading">
            {ko ? (
              <>
                깊게 알아둔 종목.
                <br />
                그다음 변화도 놓치지 않게.
              </>
            ) : (
              <>
                Research it deeply.
                <br />
                Stay close to what changes.
              </>
            )}
          </h2>
        </div>
        <p>
          {ko
            ? "관심 종목을 등록하면, 매 미국장 거래일 개장 한 시간 전부터 브리핑이 준비됩니다. 오늘 달라진 점과 다음에 확인할 조건을 읽고 장을 맞이하세요."
            : "Add your watchlist. Briefings are prepared starting one hour before each US trading day opens, covering what changed and what to watch next."}
        </p>
      </div>
      <div className="landing-daily__layout">
        <div className="landing-daily__schedule">
          <div className="landing-daily__clock">
            <span>NEW YORK · EVERY TRADING DAY</span>
            <strong>
              08<span>:</span>30<small>AM</small>
            </strong>
            <div>
              <span>{ko ? "브리핑 준비" : "BRIEFING"}</span>
              <i />
              <span>09:30 {ko ? "개장" : "OPEN"}</span>
            </div>
          </div>
          <ol>
            {(ko
              ? [
                  [
                    "어제와 달라진 것",
                    "새로운 공시와 뉴스, 실적 변화 중 투자 논리에 영향을 주는 신호를 추립니다.",
                  ],
                  [
                    "오늘 확인할 것",
                    "변화가 기업에 미치는 영향과 가까운 이벤트, 확인해야 할 조건을 정리합니다.",
                  ],
                  [
                    "에이전트들의 해석",
                    "팀별로 같은 변화를 어떻게 읽는지, 상승·하락 시나리오와 함께 살펴봅니다.",
                  ],
                ]
              : [
                  [
                    "What changed",
                    "Material news, filings and earnings developments that affect the investment thesis.",
                  ],
                  [
                    "What to check",
                    "Business implications, upcoming events and the conditions worth watching.",
                  ],
                  [
                    "How the team reads it",
                    "Different agent perspectives, with bull and bear scenarios.",
                  ],
                ]
            ).map(([title, description], index) => (
              <li key={title}>
                <span>0{index + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </li>
            ))}
          </ol>
          <Link
            className="landing-text-link"
            href={`/briefing-room?lang=${locale}`}
          >
            {ko ? "브리핑 룸 살펴보기" : "Explore the briefing room"}
            <ArrowUpRight size={15} />
          </Link>
        </div>
        <div className="landing-daily__preview" lang="en">
          <header>
            <span>
              <span className="landing-status-dot" /> BRIEFING ROOM
            </span>
            <span>ACTUAL BRIEFING · ENGLISH</span>
          </header>
          <section
            className="briefing-detail landing-daily__body"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: This scrollable document needs keyboard access.
            tabIndex={0}
            aria-label={
              ko
                ? "실제 NVIDIA 브리핑 미리보기"
                : "Actual NVIDIA briefing preview"
            }
          >
            <BriefingDetailBody edition={briefingSample} locale="en" />
          </section>
          <footer>
            <span>2026.08.11 · HISTORICAL EXAMPLE</span>
            <span>
              Scroll to read
              <ArrowDown size={12} />
            </span>
          </footer>
        </div>
      </div>
    </section>
  );
}
