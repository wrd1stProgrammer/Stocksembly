import Image from "next/image";
import type { BriefingEditionPayload } from "../../briefing/domain/contracts";
import type { Locale } from "../../lib/i18n";
import { CompanyLogo } from "../research/ResearchSidebar";
import { BriefingDecisionChecks } from "./BriefingDetailChecks";
import { BriefingDetailEarnings } from "./BriefingDetailEarnings";
import {
  BriefingLimitations,
  BriefingMaterialChanges,
  BriefingSources,
} from "./BriefingDetailSections";
import { formatBriefingDate } from "./briefingFormatting";
import { briefingCopy, nextEarnings } from "./briefingPresentation";

type Props = {
  readonly edition: BriefingEditionPayload;
  readonly locale: Locale;
};

const agentProfiles = {
  market: {
    name: { ko: "마야", en: "Maya" },
    role: { ko: "시장 책임", en: "Market Lead" },
    image: "/research/office-v8/agents/market-portrait.png",
  },
  company: {
    name: { ko: "이든", en: "Ethan" },
    role: { ko: "기업 책임", en: "Company Lead" },
    image: "/research/office-v8/agents/company-portrait.png",
  },
  financial: {
    name: { ko: "노아", en: "Noah" },
    role: { ko: "재무 책임", en: "Financial Lead" },
    image: "/research/office-v8/agents/financial-portrait.png",
  },
  risk: {
    name: { ko: "리암", en: "Liam" },
    role: { ko: "리스크 책임", en: "Risk Lead" },
    image: "/research/office-v8/agents/risk-portrait.png",
  },
} as const;

export function BriefingDetailBody({ edition, locale }: Props) {
  const copy = briefingCopy(locale);
  const earningsEvent = nextEarnings(edition);
  return (
    <>
      <header className="briefing-detail__hero">
        <CompanyLogo symbol={edition.symbol} />
        <div>
          <span>{edition.company}</span>
          <h2 id="briefing-detail-title">{edition.headline}</h2>
        </div>
        <div className="briefing-detail__hero-meta">
          <time>{formatBriefingDate(edition.generatedAt, locale, true)}</time>
          <span>{copy.earnings}</span>
          <strong>
            {earningsEvent === undefined
              ? copy.earningsPending
              : `${formatBriefingDate(earningsEvent.scheduledAt, locale)}${earningsEvent.certainty === "estimated" ? ` · ${copy.estimated}` : ""}`}
          </strong>
        </div>
      </header>
      <p className="briefing-detail__summary">{edition.summary}</p>
      <BriefingLimitations limitations={edition.limitations} locale={locale} />
      <BriefingDetailEarnings edition={edition} locale={locale} />
      {edition.changedSincePrevious === undefined ? null : (
        <section className="briefing-detail__since">
          <span>{copy.changedSince}</span>
          <p>{edition.changedSincePrevious}</p>
        </section>
      )}
      <BriefingMaterialChanges edition={edition} locale={locale} />
      <BriefingDecisionChecks
        checks={edition.todayChecks}
        events={edition.upcomingEvents}
        locale={locale}
      />
      <section className="briefing-detail__agent-paths">
        <h3>{copy.agentPaths}</h3>
        {edition.agentViews.length === 0 ? null : (
          <div className="briefing-detail__agents">
            {edition.agentViews.map((view) => {
              const profile = agentProfiles[view.agent];
              return (
                <article key={view.agent} data-stance={view.stance}>
                  <header>
                    <Image src={profile.image} alt="" width={34} height={34} />
                    <span>
                      <strong>{profile.name[locale]}</strong>
                      <small>{profile.role[locale]}</small>
                    </span>
                  </header>
                  <h4>{view.headline}</h4>
                  <p>{view.detail}</p>
                </article>
              );
            })}
          </div>
        )}
        <div className="briefing-detail__scenarios">
          <article data-case="bull">
            <span>{copy.bull}</span>
            <p>{edition.bullCase}</p>
          </article>
          <article data-case="bear">
            <span>{copy.bear}</span>
            <p>{edition.bearCase}</p>
          </article>
        </div>
      </section>
      <BriefingSources sources={edition.sources} locale={locale} />
    </>
  );
}
