import { useRouter } from "next/navigation";
import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createAuthenticatedResearchClient } from "../auth/researchClient";
import type { Locale } from "../lib/i18n";
import { copy } from "../lib/i18n";
import {
  filterTickers,
  findTicker,
  popularTickers,
  searchUsTickers,
  type Ticker,
} from "../lib/tickers";
import { RESEARCH_DIRECTION_MAX_CHARACTERS } from "../research/domain/researchDirection";
import {
  BorderBeam,
  ResearchButton,
  ResearchQuestionField,
  SearchField,
  TickerChip,
} from "./SearchPrimitives";

const LAUNCH_PULSE_MILLISECONDS = 3_000;

type SearchConsoleProps = {
  readonly locale: Locale;
  readonly tickerSearch?: (
    query: string,
    signal: AbortSignal,
  ) => Promise<readonly Ticker[]>;
};

export function SearchConsole({
  locale,
  tickerSearch = searchUsTickers,
}: SearchConsoleProps) {
  const labels = copy[locale].search;
  const [query, setQuery] = useState("");
  const [researchQuestion, setResearchQuestion] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [, startTransition] = useTransition();
  const [resultsOpen, setResultsOpen] = useState(false);
  const [remoteMatches, setRemoteMatches] = useState<readonly Ticker[]>([]);
  const [remoteQuery, setRemoteQuery] = useState("");
  const [selectedTicker, setSelectedTicker] = useState<Ticker>();
  const [isSearching, setIsSearching] = useState(false);
  const [submissionError, setSubmissionError] = useState<string>();
  const router = useRouter();
  const client = useMemo(() => createAuthenticatedResearchClient(), []);
  const normalizedQuery = query.trim().toLowerCase();
  const localMatches = useMemo(() => filterTickers(query), [query]);
  const matches =
    remoteQuery === normalizedQuery && remoteMatches.length > 0
      ? remoteMatches
      : localMatches;
  const firstMatch = selectedTicker ?? matches[0];
  const hasQuery = query.trim().length > 0;
  const hasResults = firstMatch !== undefined;
  const invalid = hasQuery && !hasResults && !isSearching;

  useEffect(() => {
    if (
      normalizedQuery.length === 0 ||
      localMatches.some(
        (ticker) => ticker.symbol.toLowerCase() === normalizedQuery,
      )
    ) {
      setRemoteMatches([]);
      setRemoteQuery("");
      setIsSearching(false);
      return;
    }
    const controller = new AbortController();
    setIsSearching(true);
    const timeout = window.setTimeout(() => {
      void tickerSearch(normalizedQuery, controller.signal)
        .then((results) => {
          setRemoteMatches(results);
          setRemoteQuery(normalizedQuery);
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setRemoteMatches([]);
            setRemoteQuery(normalizedQuery);
          }
        })
        .finally(() => setIsSearching(false));
    }, 120);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [localMatches, normalizedQuery, tickerSearch]);

  function selectTicker(ticker: Ticker) {
    setSelectedTicker(ticker);
    setQuery(ticker.symbol);
    setResultsOpen(false);
  }

  function clearSearch() {
    setQuery("");
    setSelectedTicker(undefined);
    setResultsOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") clearSearch();
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firstMatch) return;

    setSubmissionError(undefined);
    setResultsOpen(false);
    setIsSubmitting(true);
    const idempotencyKey = crypto.randomUUID();
    let createdRunId: string | undefined;
    const launchOutcome = client
      .startRun({
        symbol: firstMatch.symbol,
        question: researchQuestion,
        locale,
        idempotencyKey,
      })
      .then((created) => {
        createdRunId = created.run.runId;
        return "created" as const;
      })
      .catch(() => {
        return "failed" as const;
      });
    try {
      const pulseDelay = new Promise<"pulse-complete">((resolve) => {
        window.setTimeout(
          () => resolve("pulse-complete"),
          LAUNCH_PULSE_MILLISECONDS,
        );
      });
      const firstOutcome = await Promise.race([launchOutcome, pulseDelay]);
      if (firstOutcome === "failed") throw new Error("Research launch failed");
      if (firstOutcome === "created") await pulseDelay;
      const launchQuery = new URLSearchParams({
        lang: locale,
        launch: idempotencyKey,
        question: researchQuestion,
      });
      startTransition(() => {
        router.push(
          createdRunId === undefined
            ? `/research/${firstMatch.symbol}?${launchQuery.toString()}`
            : `/research/${firstMatch.symbol}?run=${createdRunId}&lang=${locale}`,
        );
      });
    } catch (error) {
      if (error instanceof Error) {
        setSubmissionError(
          locale === "ko"
            ? "리서치를 시작할 수 없습니다. 다시 시도해 주세요."
            : "Unable to start research. Please try again.",
        );
      } else {
        throw error;
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <BorderBeam
      active={isSubmitting}
      size="pulse-outside"
      colorVariant="colorful"
    >
      <form className="search-console" id="research" onSubmit={submitSearch}>
        <div className="search-console__primary">
          <SearchField
            value={query}
            label={labels.label}
            placeholder={labels.placeholder}
            invalid={invalid}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedTicker(undefined);
              setResultsOpen(true);
            }}
            onKeyDown={handleKeyDown}
          />
          <ResearchQuestionField
            value={researchQuestion}
            label={labels.questionLabel}
            placeholder={labels.questionPlaceholder}
            onChange={(event) =>
              setResearchQuestion(
                Array.from(event.target.value)
                  .slice(0, RESEARCH_DIRECTION_MAX_CHARACTERS)
                  .join(""),
              )
            }
          />
          <ResearchButton
            label={labels.action}
            loadingLabel={labels.loading}
            disabled={!hasResults || isSubmitting}
            loading={isSubmitting}
          />
        </div>

        <div className="search-console__footer">
          <fieldset className="ticker-list">
            <legend className="sr-only">{labels.popular}</legend>
            {popularTickers.map((symbol) => (
              <TickerChip
                key={symbol}
                symbol={symbol}
                selected={query === symbol}
                onSelect={(value) => {
                  const ticker = findTicker(value);
                  if (ticker !== undefined) selectTicker(ticker);
                }}
              />
            ))}
          </fieldset>
        </div>

        {submissionError === undefined ? null : (
          <p role="alert">{submissionError}</p>
        )}

        {hasQuery && hasResults && resultsOpen ? (
          <section
            className="search-results"
            aria-label={copy[locale].a11y.results}
          >
            {matches.map((ticker) => (
              <button
                key={ticker.symbol}
                type="button"
                onClick={() => selectTicker(ticker)}
              >
                <strong className="search-results__symbol">
                  {ticker.symbol}
                </strong>
                <span className="search-results__company">
                  <span>{ticker.company}</span>
                  <small>{ticker.sector}</small>
                </span>
                <span className="search-results__meta">{ticker.exchange}</span>
              </button>
            ))}
          </section>
        ) : null}
      </form>
    </BorderBeam>
  );
}
