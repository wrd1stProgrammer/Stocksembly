import { Minus, Plus, Search, Sparkles, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { BriefingWatchlistItem } from "../../briefing/domain/contracts";
import type { Locale } from "../../lib/i18n";
import { CompanyLogo } from "../research/ResearchSidebar";

export type TickerResult = {
  readonly symbol: string;
  readonly providerCode: string;
  readonly company: string;
  readonly exchange: string;
};

type Props = {
  readonly locale: Locale;
  readonly items: readonly BriefingWatchlistItem[];
  readonly limit: number;
  readonly changesRemaining: number;
  readonly briefingCount: number;
  readonly selectedSymbol: string;
  readonly adding: boolean;
  readonly query: string;
  readonly results: readonly TickerResult[];
  readonly busySymbol: string | undefined;
  readonly onAddingChange: (adding: boolean) => void;
  readonly onQueryChange: (query: string) => void;
  readonly onSelect: (symbol: string) => void;
  readonly onAdd: (symbol: string) => void;
  readonly onRemove: (item: BriefingWatchlistItem) => void;
};

const copy = {
  ko: {
    title: "관심종목",
    add: "종목 추가",
    search: "티커 또는 기업 검색",
    remaining: "남은 변경 횟수",
    times: "회",
    all: "전체",
    remove: "관심종목에서 삭제",
  },
  en: {
    title: "Watchlist",
    add: "Add stock",
    search: "Search ticker or company",
    remaining: "Changes remaining",
    times: "",
    all: "All",
    remove: "Remove from watchlist",
  },
} as const;

export function BriefingWatchlist(props: Props) {
  const labels = copy[props.locale];
  const searchRef = useRef<HTMLInputElement>(null);
  const canChange = props.changesRemaining > 0;
  useEffect(() => {
    if (props.adding) searchRef.current?.focus();
  }, [props.adding]);

  return (
    <aside className="briefing-watchlist">
      <header>
        <div>
          <div>
            <span>{labels.title}</span>
            <strong>
              {props.items.length} / {props.limit}
            </strong>
          </div>
          <small>
            {labels.remaining} {props.changesRemaining}
            {labels.times}
          </small>
        </div>
        <button
          type="button"
          onClick={() => props.onAddingChange(!props.adding)}
          disabled={props.items.length >= props.limit || !canChange}
          aria-label={labels.add}
        >
          {props.adding ? <X size={16} /> : <Plus size={16} />}
        </button>
      </header>

      {props.adding ? (
        <div className="briefing-watchlist__search">
          <label>
            <Search size={15} />
            <input
              ref={searchRef}
              value={props.query}
              onChange={(event) => props.onQueryChange(event.target.value)}
              placeholder={labels.search}
            />
          </label>
          {props.results.length === 0 ? null : (
            <div>
              {props.results.map((result) => (
                <button
                  key={result.providerCode}
                  type="button"
                  disabled={props.busySymbol !== undefined}
                  onClick={() => props.onAdd(result.symbol)}
                >
                  <CompanyLogo symbol={result.symbol} />
                  <span>
                    <strong>{result.symbol}</strong>
                    <small>{result.company}</small>
                  </span>
                  <Plus size={14} />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <nav>
        <button
          type="button"
          className={props.selectedSymbol === "all" ? "is-active" : undefined}
          onClick={() => props.onSelect("all")}
        >
          <Sparkles size={16} />
          <span>{labels.all}</span>
          <small>{props.briefingCount}</small>
        </button>
        {props.items.map((item) => (
          <div key={item.symbol}>
            <button
              type="button"
              className={
                props.selectedSymbol === item.symbol ? "is-active" : undefined
              }
              onClick={() => props.onSelect(item.symbol)}
            >
              <CompanyLogo symbol={item.symbol} />
              <span>
                <strong>{item.symbol}</strong>
                <small>{item.company}</small>
              </span>
            </button>
            <button
              type="button"
              className="briefing-watchlist__remove"
              onClick={() => props.onRemove(item)}
              disabled={props.busySymbol === item.symbol || !canChange}
              aria-label={`${item.symbol} ${labels.remove}`}
            >
              <Minus size={13} />
            </button>
          </div>
        ))}
      </nav>
    </aside>
  );
}
