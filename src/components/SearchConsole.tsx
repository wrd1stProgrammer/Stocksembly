import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { authIsConfigured } from "../auth/amplifyClient";
import { createAuthenticatedResearchClient } from "../auth/researchClient";
import { currentAuthTokens } from "../auth/researchSession";
import type { Locale } from "../lib/i18n";
import { copy } from "../lib/i18n";
import { filterTickers, searchUsTickers, type Ticker } from "../lib/tickers";
import { ResearchRequestError } from "../research/client/api";
import { RESEARCH_DIRECTION_MAX_CHARACTERS } from "../research/domain/researchDirection";
import {
  COMMITTEE_RESEARCH_TARGET,
  RESEARCH_DEPARTMENT_COPY,
  type ResearchTarget,
  recommendResearchTarget,
  researchTargetQueryValue,
} from "../research/domain/researchTarget";
import {
  BorderBeam,
  ResearchButton,
  ResearchQuestionField,
  SearchField,
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
  const [targetOverride, setTargetOverride] = useState<ResearchTarget>();
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
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
  const hasResearchQuestion = researchQuestion.trim().length > 0;
  const canStartResearch = hasResults && hasResearchQuestion && !isSubmitting;
  const invalid = hasQuery && !hasResults && !isSearching;
  const recommendation = useMemo(
    () => recommendResearchTarget(researchQuestion),
    [researchQuestion],
  );
  const researchTarget = targetOverride ?? recommendation.target;
  const targetCopy =
    researchTarget.kind === "committee"
      ? locale === "ko"
        ? "전체 에이전트 위원회"
        : "Full research committee"
      : RESEARCH_DEPARTMENT_COPY[researchTarget.departmentId][
          locale === "ko" ? "ko" : "en"
        ];
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
    if (!firstMatch || !hasResearchQuestion) return;

    setSubmissionError(undefined);
    setResultsOpen(false);
    setIsSubmitting(true);
    if (authIsConfigured()) {
      const tokens = await currentAuthTokens().catch(() => ({
        accessToken: undefined,
      }));
      if (tokens.accessToken === undefined) {
        setIsSubmitting(false);
        router.push(
          `/login?next=${encodeURIComponent(`/?lang=${locale}#research`)}`,
        );
        return;
      }
    }
    const idempotencyKey = crypto.randomUUID();
    let createdRunId: string | undefined;
    const launchOutcome = client
      .startRun({
        symbol: firstMatch.symbol,
        question: researchQuestion,
        locale,
        idempotencyKey,
        researchTarget,
      })
      .then((created) => {
        createdRunId = created.run.runId;
        return "created" as const;
      })
      .catch((error: unknown) => {
        if (error instanceof ResearchRequestError && error.status === 401)
          return "unauthorized" as const;
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
      if (firstOutcome === "unauthorized") {
        router.push(
          `/login?next=${encodeURIComponent(`/?lang=${locale}#research`)}`,
        );
        return;
      }
      if (firstOutcome === "failed") throw new Error("Research launch failed");
      if (firstOutcome === "created") await pulseDelay;
      const launchQuery = new URLSearchParams({
        lang: locale,
        launch: idempotencyKey,
        question: researchQuestion,
        target: researchTargetQueryValue(researchTarget),
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
        </div>

        <div className="search-console__actions">
          <section
            className="research-target"
            aria-label={locale === "ko" ? "리서치 방식" : "Research mode"}
          >
            <button
              className="research-target__trigger"
              type="button"
              aria-expanded={targetPickerOpen}
              aria-haspopup="menu"
              title={recommendation.reason[locale]}
              onClick={() => setTargetPickerOpen((open) => !open)}
            >
              {targetOverride === undefined ? (
                <span>{locale === "ko" ? "추천" : "Recommended"}</span>
              ) : null}
              <strong>{targetCopy}</strong>
              <ChevronDown aria-hidden="true" size={16} strokeWidth={1.8} />
            </button>
            {targetPickerOpen ? (
              <div className="research-target__options" role="menu">
                {[
                  {
                    target: COMMITTEE_RESEARCH_TARGET,
                    label:
                      locale === "ko"
                        ? "전체 에이전트 위원회"
                        : "Full research committee",
                    note:
                      locale === "ko"
                        ? "11명 전체 분석과 반론·최종 판단"
                        : "All 11 specialists, rebuttal, and final decision",
                  },
                  ...(["market", "company", "financial", "risk"] as const).map(
                    (departmentId) => ({
                      target: {
                        kind: "department" as const,
                        departmentId,
                      },
                      label:
                        RESEARCH_DEPARTMENT_COPY[departmentId][
                          locale === "ko" ? "ko" : "en"
                        ],
                      note:
                        locale === "ko"
                          ? "해당 팀만 참여하는 심층 검토"
                          : "Focused review by this team only",
                    }),
                  ),
                ].map((option) => {
                  const selected =
                    option.target.kind === researchTarget.kind &&
                    (option.target.kind === "committee" ||
                      (researchTarget.kind === "department" &&
                        option.target.departmentId ===
                          researchTarget.departmentId));
                  return (
                    <button
                      key={
                        option.target.kind === "committee"
                          ? "committee"
                          : option.target.departmentId
                      }
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => {
                        setTargetOverride(option.target);
                        setTargetPickerOpen(false);
                      }}
                    >
                      <strong>{option.label}</strong>
                      <small>{option.note}</small>
                    </button>
                  );
                })}
                {targetOverride === undefined ? null : (
                  <button
                    className="research-target__auto"
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setTargetOverride(undefined);
                      setTargetPickerOpen(false);
                    }}
                  >
                    {locale === "ko"
                      ? "질문에 맞춰 다시 추천"
                      : "Use question-based recommendation"}
                  </button>
                )}
              </div>
            ) : null}
          </section>
          <ResearchButton
            label={labels.action}
            loadingLabel={labels.loading}
            disabled={!canStartResearch}
            loading={isSubmitting}
          />
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
