import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { localizeBriefingLimitation } from "../../briefing/domain/briefingLimitations";
import type {
  BriefingEditionPayload,
  BriefingSignal,
  BriefingSource,
} from "../../briefing/domain/contracts";
import type { Locale } from "../../lib/i18n";
import { formatBriefingDate } from "./briefingFormatting";
import {
  briefingCopy,
  hasExtendedCoverage,
  safeExternalHref,
} from "./briefingPresentation";

type DetailProps = {
  readonly edition: BriefingEditionPayload;
  readonly locale: Locale;
};

function ExternalLink({
  href,
  children,
}: {
  readonly href: string;
  readonly children: ReactNode;
}) {
  const safeHref = safeExternalHref(href);
  if (safeHref === undefined) return <>{children}</>;
  return (
    <a href={safeHref} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export function BriefingMaterialChanges({ edition, locale }: DetailProps) {
  const copy = briefingCopy(locale);
  return (
    <section>
      <h3>
        {hasExtendedCoverage(edition) ? copy.extendedChanges : copy.changes}
      </h3>
      <div className="briefing-detail__changes">
        {edition.materialChanges.length === 0 ? (
          <p className="briefing-detail__no-change">{copy.noChanges}</p>
        ) : (
          edition.materialChanges.map((signal, index) => (
            <MaterialChange
              key={signal.id}
              signal={signal}
              index={index}
              locale={locale}
            />
          ))
        )}
      </div>
    </section>
  );
}

function MaterialChange({
  signal,
  index,
  locale,
}: {
  readonly signal: BriefingSignal;
  readonly index: number;
  readonly locale: Locale;
}) {
  const copy = briefingCopy(locale);
  const href = safeExternalHref(signal.sourceUrl);
  return (
    <article>
      <span>{String(index + 1).padStart(2, "0")}</span>
      <div>
        <h4>{signal.title}</h4>
        <p>{signal.detail}</p>
        <strong>{signal.investmentMeaning}</strong>
        {href === undefined ? null : (
          <ExternalLink href={href}>
            {copy.source} <ArrowUpRight size={13} aria-hidden="true" />
          </ExternalLink>
        )}
      </div>
    </article>
  );
}

export function BriefingSources({
  sources,
  locale,
}: {
  readonly sources: readonly BriefingSource[];
  readonly locale: Locale;
}) {
  const copy = briefingCopy(locale);
  const visibleSources = sources.filter(
    (source) => safeExternalHref(source.url) !== undefined,
  );
  if (visibleSources.length === 0) return null;
  return (
    <section>
      <h3>{copy.citedSources}</h3>
      <div className="briefing-detail__sources">
        {visibleSources.map((source) => (
          <ExternalLink
            key={`${source.publisher}:${source.url}`}
            href={source.url}
          >
            <span>{source.publisher}</span>
            <strong>{source.title}</strong>
            <time>{formatBriefingDate(source.publishedAt, locale, true)}</time>
          </ExternalLink>
        ))}
      </div>
    </section>
  );
}

export function BriefingLimitations({
  limitations,
  locale,
}: {
  readonly limitations: readonly string[];
  readonly locale: Locale;
}) {
  const copy = briefingCopy(locale);
  if (limitations.length === 0) return null;
  return (
    <section className="briefing-detail__limitations">
      <h3>{copy.limitations}</h3>
      <ul>
        {limitations.map((limitation) => (
          <li key={limitation}>
            {localizeBriefingLimitation(limitation, locale)}
          </li>
        ))}
      </ul>
    </section>
  );
}
