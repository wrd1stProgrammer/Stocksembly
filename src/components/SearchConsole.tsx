import {
  ChevronDown,
  LockKeyhole,
  Plus,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { authIsConfigured } from "../auth/amplifyClient";
import { createAuthenticatedResearchClient } from "../auth/researchClient";
import { currentAuthTokens } from "../auth/researchSession";
import type { Locale } from "../lib/i18n";
import { copy } from "../lib/i18n";
import { filterTickers, searchUsTickers, type Ticker } from "../lib/tickers";
import { notifyBillingChanged } from "../lib/whop/billingEvents";
import { researchCreditCost } from "../lib/whop/creditPolicy";
import { ResearchRequestError } from "../research/client/api";
import { TickerSymbolSchema } from "../research/domain/ids";
import { RESEARCH_DIRECTION_MAX_CHARACTERS } from "../research/domain/researchDirection";
import {
  DEFAULT_RESEARCH_PROFILE,
  type ResearchProfile,
} from "../research/domain/researchProfile";
import {
  COMMITTEE_RESEARCH_TARGET,
  RESEARCH_DEPARTMENT_COPY,
  type ResearchTarget,
  recommendResearchTarget,
} from "../research/domain/researchTarget";
import { CreditShortageModal } from "./billing/CreditShortageModal";
import { MembershipAccessModal } from "./billing/MembershipAccessModal";
import {
  BorderBeam,
  ResearchButton,
  ResearchQuestionField,
  SearchField,
} from "./SearchPrimitives";

type SearchConsoleProps = {
  readonly locale: Locale;
  readonly onOpenPlans?: () => void;
  readonly subscriptionTier?: "unknown" | "free" | "paid";
  readonly creditsRemaining?: number | undefined;
  readonly tickerSearch?: (
    query: string,
    signal: AbortSignal,
  ) => Promise<readonly Ticker[]>;
};

export function SearchConsole({
  locale,
  onOpenPlans,
  subscriptionTier = "unknown",
  creditsRemaining,
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
  const [creditShortageOpen, setCreditShortageOpen] = useState(false);
  const [membershipGateOpen, setMembershipGateOpen] = useState(false);
  const [targetOverride, setTargetOverride] = useState<ResearchTarget>();
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [researchProfile, setResearchProfile] = useState<ResearchProfile>(
    DEFAULT_RESEARCH_PROFILE,
  );
  const [comparisonDraft, setComparisonDraft] = useState("");
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
  const requiredCredits = researchCreditCost(researchTarget);
  const customSettingsLocked = subscriptionTier === "free";
  const targetCopy =
    researchTarget.kind === "committee"
      ? locale === "ko"
        ? "전체 에이전트 위원회"
        : "Full research committee"
      : RESEARCH_DEPARTMENT_COPY[researchTarget.departmentId][
          locale === "ko" ? "ko" : "en"
        ];
  const profileCopy =
    locale === "ko"
      ? {
          customize: "맞춤 설정",
          horizon: "투자 기간",
          horizonNote: "판단이 유효해야 할 시간",
          counter: "반론 강도",
          counterNote: "반대 논리를 파고드는 정도",
          depth: "분석 깊이",
          depthNote: "에이전트별 논거와 리포트 분량",
          purpose: "의사결정 목적",
          purposeNote: "결론을 실제 행동 조건으로 바꾸는 기준",
          peers: "비교기업",
          peersNote: "Stocksembly 상대 비교 · 최대 5개",
          peerPlaceholder: "티커 입력 (예: AMD)",
          noPeers: "미포함",
          horizonOptions: {
            short: "단기",
            medium: "중기",
            long: "장기",
          },
          counterOptions: { standard: "표준", strong: "강하게" },
          depthOptions: { core: "핵심", standard: "표준", deep: "심층" },
          purposeOptions: {
            new_entry: "신규 진입",
            holding_review: "보유 점검",
            position_sizing: "비중 조절",
            earnings: "실적 전후",
          },
        }
      : {
          customize: "Customize",
          horizon: "Investment horizon",
          horizonNote: "How long the decision should remain valid",
          counter: "Counterargument",
          counterNote: "How aggressively the opposing case is tested",
          depth: "Analysis depth",
          depthNote: "Evidence breadth and report length",
          purpose: "Decision purpose",
          purposeNote: "The action the report should help decide",
          peers: "Comparisons",
          peersNote: "Stocksembly relative view · up to 5",
          peerPlaceholder: "Add ticker (e.g. AMD)",
          noPeers: "None",
          horizonOptions: {
            short: "Short",
            medium: "Medium",
            long: "Long",
          },
          counterOptions: { standard: "Standard", strong: "Strong" },
          depthOptions: { core: "Core", standard: "Standard", deep: "Deep" },
          purposeOptions: {
            new_entry: "New entry",
            holding_review: "Holding review",
            position_sizing: "Position sizing",
            earnings: "Around earnings",
          },
        };

  function updateProfile<Key extends keyof ResearchProfile>(
    key: Key,
    value: ResearchProfile[Key],
  ) {
    setResearchProfile((current) => ({ ...current, [key]: value }));
  }

  function addComparisonSymbol() {
    const parsedSymbol = TickerSymbolSchema.safeParse(
      comparisonDraft.trim().toUpperCase(),
    );
    if (!parsedSymbol.success) return;
    const symbol = parsedSymbol.data;
    if (
      symbol === firstMatch?.symbol ||
      researchProfile.comparisonSymbols.includes(symbol) ||
      researchProfile.comparisonSymbols.length >= 5
    ) {
      setComparisonDraft("");
      return;
    }
    updateProfile("comparisonSymbols", [
      ...researchProfile.comparisonSymbols,
      symbol,
    ]);
    setComparisonDraft("");
  }
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
    if (creditsRemaining !== undefined && creditsRemaining < requiredCredits) {
      setIsSubmitting(false);
      setCreditShortageOpen(true);
      return;
    }
    const idempotencyKey = crypto.randomUUID();
    try {
      const created = await client.startRun({
        symbol: firstMatch.symbol,
        question: researchQuestion,
        locale,
        idempotencyKey,
        researchTarget,
        researchProfile,
      });
      notifyBillingChanged();
      startTransition(() => {
        router.push(
          `/research/${firstMatch.symbol}?run=${created.run.runId}&lang=${locale}`,
        );
      });
    } catch (error) {
      if (error instanceof ResearchRequestError && error.status === 401) {
        router.push(
          `/login?next=${encodeURIComponent(`/?lang=${locale}#research`)}`,
        );
        return;
      }
      if (
        error instanceof ResearchRequestError &&
        error.code === "CREDITS_INSUFFICIENT"
      ) {
        setCreditShortageOpen(true);
        return;
      }
      setSubmissionError(
        locale === "ko"
          ? "리서치를 시작할 수 없습니다. 다시 시도해 주세요."
          : "Unable to start research. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
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
              onChange={(value) => {
                setQuery(value);
                setSelectedTicker(undefined);
                setResultsOpen(true);
              }}
              onKeyDown={handleKeyDown}
            />
            <ResearchQuestionField
              value={researchQuestion}
              label={labels.questionLabel}
              placeholder={labels.questionPlaceholder}
              onChange={(value) =>
                setResearchQuestion(
                  Array.from(value)
                    .slice(0, RESEARCH_DIRECTION_MAX_CHARACTERS)
                    .join(""),
                )
              }
            />
          </div>

          {profileOpen ? (
            <section
              className="research-profile"
              id="research-profile-panel"
              aria-label={profileCopy.customize}
            >
              <header>
                <div>
                  <strong>{profileCopy.customize}</strong>
                  <small>
                    {
                      profileCopy.horizonOptions[
                        researchProfile.investmentHorizon
                      ]
                    }
                    {" · "}
                    {profileCopy.depthOptions[researchProfile.analysisDepth]}
                    {" · "}
                    {
                      profileCopy.purposeOptions[
                        researchProfile.decisionPurpose
                      ]
                    }
                  </small>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setProfileOpen(false)}
                >
                  <X aria-hidden="true" size={16} />
                </button>
              </header>
              <div className="research-profile__grid">
                <ProfileChoice
                  label={profileCopy.horizon}
                  note={profileCopy.horizonNote}
                  value={researchProfile.investmentHorizon}
                  options={profileCopy.horizonOptions}
                  onChange={(value) =>
                    updateProfile("investmentHorizon", value)
                  }
                />
                <ProfileChoice
                  label={profileCopy.counter}
                  note={profileCopy.counterNote}
                  value={researchProfile.counterargumentIntensity}
                  options={profileCopy.counterOptions}
                  onChange={(value) =>
                    updateProfile("counterargumentIntensity", value)
                  }
                />
                <ProfileChoice
                  label={profileCopy.depth}
                  note={profileCopy.depthNote}
                  value={researchProfile.analysisDepth}
                  options={profileCopy.depthOptions}
                  onChange={(value) => updateProfile("analysisDepth", value)}
                />
                <ProfileChoice
                  label={profileCopy.purpose}
                  note={profileCopy.purposeNote}
                  value={researchProfile.decisionPurpose}
                  options={profileCopy.purposeOptions}
                  onChange={(value) => updateProfile("decisionPurpose", value)}
                />
                <div className="research-profile__peers">
                  <div>
                    <strong>{profileCopy.peers}</strong>
                    <small>{profileCopy.peersNote}</small>
                  </div>
                  <div className="research-profile__peer-entry">
                    <input
                      value={comparisonDraft}
                      maxLength={5}
                      placeholder={profileCopy.peerPlaceholder}
                      onChange={(event) =>
                        setComparisonDraft(
                          event.target.value.replace(/[^a-z.]/giu, ""),
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        addComparisonSymbol();
                      }}
                    />
                    <button
                      type="button"
                      aria-label="Add comparison"
                      disabled={researchProfile.comparisonSymbols.length >= 5}
                      onClick={addComparisonSymbol}
                    >
                      <Plus aria-hidden="true" size={15} />
                    </button>
                  </div>
                  <div className="research-profile__peer-list">
                    {researchProfile.comparisonSymbols.length === 0 ? (
                      <span>{profileCopy.noPeers}</span>
                    ) : (
                      researchProfile.comparisonSymbols.map((symbol) => (
                        <button
                          key={symbol}
                          type="button"
                          onClick={() =>
                            updateProfile(
                              "comparisonSymbols",
                              researchProfile.comparisonSymbols.filter(
                                (item) => item !== symbol,
                              ),
                            )
                          }
                        >
                          {symbol}
                          <X aria-hidden="true" size={11} />
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <div className="search-console__actions">
            <button
              className="research-profile-trigger"
              type="button"
              aria-expanded={profileOpen}
              aria-controls="research-profile-panel"
              aria-label={profileCopy.customize}
              title={profileCopy.customize}
              aria-disabled={customSettingsLocked || undefined}
              data-locked={customSettingsLocked ? "true" : undefined}
              onClick={() => {
                if (customSettingsLocked) {
                  setMembershipGateOpen(true);
                  return;
                }
                setTargetPickerOpen(false);
                setProfileOpen((open) => !open);
              }}
            >
              {customSettingsLocked ? (
                <LockKeyhole aria-hidden="true" size={16} />
              ) : (
                <SlidersHorizontal aria-hidden="true" size={17} />
              )}
            </button>
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
                onClick={() => {
                  setProfileOpen(false);
                  setTargetPickerOpen((open) => !open);
                }}
              >
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
                    ...(
                      ["market", "company", "financial", "risk"] as const
                    ).map((departmentId) => ({
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
                    })),
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
                  <span className="search-results__meta">
                    {ticker.exchange}
                  </span>
                </button>
              ))}
            </section>
          ) : null}
        </form>
      </BorderBeam>
      <CreditShortageModal
        locale={locale}
        open={creditShortageOpen}
        required={requiredCredits}
        remaining={creditsRemaining}
        onClose={() => setCreditShortageOpen(false)}
      />
      <MembershipAccessModal
        locale={locale}
        open={membershipGateOpen}
        reason="customize"
        onClose={() => setMembershipGateOpen(false)}
        onOpenPlans={onOpenPlans}
      />
    </>
  );
}

function ProfileChoice<Value extends string>(props: {
  readonly label: string;
  readonly note: string;
  readonly value: Value;
  readonly options: Readonly<Record<Value, string>>;
  readonly disabled?: boolean;
  readonly onChange: (value: Value) => void;
}) {
  return (
    <fieldset className="research-profile__choice">
      <legend>{props.label}</legend>
      <small>{props.note}</small>
      <div>
        {(Object.entries(props.options) as [Value, string][]).map(
          ([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={props.value === value}
              disabled={props.disabled}
              onClick={() => props.onChange(value)}
            >
              {label}
            </button>
          ),
        )}
      </div>
    </fieldset>
  );
}
