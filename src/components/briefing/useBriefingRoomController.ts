import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import type {
  BriefingEditionPayload,
  BriefingListItem,
  BriefingRoomState,
  BriefingWatchlistItem,
} from "../../briefing/domain/contracts";
import type { Locale } from "../../lib/i18n";
import type { TickerResult } from "./BriefingWatchlist";

const TickerResultsSchema = z.object({
  tickers: z
    .array(
      z.object({
        symbol: z.string(),
        providerCode: z.string(),
        company: z.string(),
        exchange: z.string(),
      }),
    )
    .optional(),
});

type Input = {
  readonly initialState: BriefingRoomState;
  readonly locale: Locale;
  readonly initialDetails:
    | Readonly<Record<string, BriefingEditionPayload>>
    | undefined;
};

export function useBriefingRoomController({
  initialState,
  locale,
  initialDetails,
}: Input) {
  const [state, setState] = useState(initialState);
  const [selectedSymbol, setSelectedSymbol] = useState("all");
  const [selected, setSelected] = useState<BriefingEditionPayload>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly TickerResult[]>([]);
  const [busySymbol, setBusySymbol] = useState<string>();

  useEffect(() => {
    if (!adding || query.trim().length < 1) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(
        `/api/research/tickers?q=${encodeURIComponent(query.trim())}`,
        {
          cache: "no-store",
          signal: controller.signal,
        },
      )
        .then(async (response) => {
          if (!response.ok) return [];
          const parsed = TickerResultsSchema.safeParse(await response.json());
          return parsed.success ? (parsed.data.tickers ?? []).slice(0, 6) : [];
        })
        .then(setResults)
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          if (error instanceof TypeError) {
            setResults([]);
            return;
          }
          throw error;
        });
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [adding, query]);

  const briefings = useMemo(
    () =>
      selectedSymbol === "all"
        ? state.briefings
        : state.briefings.filter(
            (briefing) => briefing.symbol === selectedSymbol,
          ),
    [selectedSymbol, state.briefings],
  );

  async function refresh(): Promise<void> {
    const response = await fetch(`/api/briefings?locale=${locale}`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (response.ok) setState(await response.json());
  }

  async function addItem(symbol: string): Promise<void> {
    setBusySymbol(symbol);
    try {
      const response = await fetch("/api/briefings/watchlist", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      if (!response.ok) return;
      await refresh();
      setAdding(false);
      setQuery("");
    } finally {
      setBusySymbol(undefined);
    }
  }

  async function removeItem(item: BriefingWatchlistItem): Promise<void> {
    setBusySymbol(item.symbol);
    try {
      const response = await fetch(
        `/api/briefings/watchlist/${encodeURIComponent(item.symbol)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      if (!response.ok) return;
      if (selectedSymbol === item.symbol) setSelectedSymbol("all");
      await refresh();
    } finally {
      setBusySymbol(undefined);
    }
  }

  function markLocallyRead(briefingId: string): void {
    setState((current) => ({
      ...current,
      unreadCount: Math.max(0, current.unreadCount - 1),
      briefings: current.briefings.map((briefing) =>
        briefing.briefingId === briefingId
          ? { ...briefing, unread: false }
          : briefing,
      ),
    }));
  }

  async function openBriefing(item: BriefingListItem): Promise<void> {
    setSelected(undefined);
    setDetailOpen(true);
    const preloaded = initialDetails?.[item.briefingId];
    let payload = preloaded;
    try {
      if (payload === undefined) {
        const response = await fetch(`/api/briefings/${item.briefingId}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok) {
          setDetailOpen(false);
          return;
        }
        const result = await response.json();
        payload = result.briefing;
        if (payload === undefined) {
          setDetailOpen(false);
          return;
        }
      }
      setSelected(payload);
      if (!item.unread) return;
      if (preloaded === undefined) {
        const readResponse = await fetch(
          `/api/briefings/${item.briefingId}/read`,
          { method: "POST", credentials: "same-origin" },
        );
        if (!readResponse.ok) return;
      }
      markLocallyRead(item.briefingId);
    } catch (error) {
      if (error instanceof TypeError) {
        setDetailOpen(false);
        return;
      }
      throw error;
    }
  }

  return {
    state,
    selectedSymbol,
    selected,
    detailOpen,
    adding,
    query,
    results,
    busySymbol,
    briefings,
    setSelectedSymbol,
    setDetailOpen,
    setAdding,
    setQuery,
    addItem,
    removeItem,
    openBriefing,
  };
}
