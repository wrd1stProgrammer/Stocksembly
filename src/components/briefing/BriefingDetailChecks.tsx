import type {
  BriefingDecisionCheck,
  BriefingUpcomingEvent,
} from "../../briefing/domain/contracts";
import type { Locale } from "../../lib/i18n";
import { formatBriefingDate } from "./briefingFormatting";
import {
  briefingCopy,
  isDecisionCheck,
  isNextCatalystCheck,
} from "./briefingPresentation";

type Props = {
  readonly checks: readonly (BriefingDecisionCheck | string)[];
  readonly events: readonly BriefingUpcomingEvent[];
  readonly locale: Locale;
};

function eventMatchesCheck(
  event: BriefingUpcomingEvent,
  check: BriefingDecisionCheck,
): boolean {
  const checkDate = check.timing.match(/\b\d{4}-\d{2}-\d{2}\b/u)?.[0];
  if (checkDate !== event.scheduledAt.slice(0, 10)) return false;
  const checkText = `${check.title} ${check.metric}`.toLowerCase();
  if (/earnings|results|실적/iu.test(event.name))
    return /earnings|results|실적/iu.test(checkText);
  return event.name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length >= 3)
    .some((term) => checkText.includes(term));
}

export function BriefingDecisionChecks({ checks, events, locale }: Props) {
  const copy = briefingCopy(locale);
  const sameSession = checks.filter(
    (check) => !isDecisionCheck(check) || !isNextCatalystCheck(check),
  );
  const future = checks.filter(
    (check): check is BriefingDecisionCheck =>
      isDecisionCheck(check) && isNextCatalystCheck(check),
  );
  return (
    <>
      <CheckList
        heading={copy.todayChecks}
        checks={sameSession}
        locale={locale}
      />
      <CatalystSection checks={future} events={events} locale={locale} />
    </>
  );
}

function CheckList({
  heading,
  checks,
  locale,
}: {
  readonly heading: string;
  readonly checks: readonly (BriefingDecisionCheck | string)[];
  readonly locale: Locale;
}) {
  if (checks.length === 0) return null;
  return (
    <section>
      <h3>{heading}</h3>
      <CheckItems checks={checks} locale={locale} />
    </section>
  );
}

function CatalystSection({
  checks,
  events,
  locale,
}: {
  readonly checks: readonly BriefingDecisionCheck[];
  readonly events: readonly BriefingUpcomingEvent[];
  readonly locale: Locale;
}) {
  const copy = briefingCopy(locale);
  if (checks.length === 0 && events.length === 0) return null;
  const visibleEvents = events.filter(
    (event) => !checks.some((check) => eventMatchesCheck(event, check)),
  );
  const estimatedCheckKeys = new Set(
    checks.flatMap((check) =>
      events.some(
        (event) =>
          event.certainty === "estimated" && eventMatchesCheck(event, check),
      )
        ? [`${check.title}:${check.timing}`]
        : [],
    ),
  );
  return (
    <section>
      <h3>{copy.nextCatalyst}</h3>
      {checks.length === 0 ? null : (
        <CheckItems
          checks={checks}
          locale={locale}
          estimatedCheckKeys={estimatedCheckKeys}
        />
      )}
      {visibleEvents.length === 0 ? null : (
        <div className="briefing-detail__events">
          {visibleEvents.map((event) => (
            <article key={`${event.name}:${event.scheduledAt}`}>
              <div>
                <time>
                  {formatBriefingDate(event.scheduledAt, locale, true)}
                </time>
                {event.certainty === "estimated" ? (
                  <span>{copy.estimated}</span>
                ) : null}
              </div>
              <div>
                <h4>{event.name}</h4>
                <p>{event.whyItMatters}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function CheckItems({
  checks,
  locale,
  estimatedCheckKeys,
}: {
  readonly checks: readonly (BriefingDecisionCheck | string)[];
  readonly locale: Locale;
  readonly estimatedCheckKeys?: ReadonlySet<string>;
}) {
  const copy = briefingCopy(locale);
  return (
    <ol className="briefing-detail__checks">
      {checks.map((check) => (
        <li
          key={
            typeof check === "string" ? check : `${check.title}:${check.timing}`
          }
        >
          {typeof check === "string" ? (
            <span>{check}</span>
          ) : (
            <article>
              <header>
                <h4>{check.title}</h4>
                <div className="briefing-detail__check-timing">
                  <time>{check.timing}</time>
                  {estimatedCheckKeys?.has(`${check.title}:${check.timing}`) ? (
                    <span>{copy.estimated}</span>
                  ) : null}
                </div>
              </header>
              <dl>
                <div>
                  <dt>{copy.observe}</dt>
                  <dd>{check.metric}</dd>
                </div>
                <div data-outcome="confirmed">
                  <dt>{copy.confirmed}</dt>
                  <dd>
                    <strong>{check.confirmation}</strong>
                    <span>{check.ifConfirmed}</span>
                  </dd>
                </div>
                {check.ifUnclear === undefined ? null : (
                  <div data-outcome="unclear">
                    <dt>{copy.unclear}</dt>
                    <dd>{check.ifUnclear}</dd>
                  </div>
                )}
                <div data-outcome="weakened">
                  <dt>{copy.weakened}</dt>
                  <dd>{check.ifFailed}</dd>
                </div>
              </dl>
            </article>
          )}
        </li>
      ))}
    </ol>
  );
}
