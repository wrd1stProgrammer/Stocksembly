"use client";
import { ArrowRight, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import {
  type OnboardingStock,
  OnboardingStockSchema,
} from "../../accounts/onboardingInterests";
import { currentAuthTokens } from "../../auth/researchSession";
import type { AppLocale } from "../../lib/i18n";

const copy: Record<
  AppLocale,
  readonly [string, string, string, string, string, string, string]
> = {
  en: [
    "Your interests",
    "Which stocks are you following?",
    "Choose 1–3 stocks. When you continue, we’ll start preparing their research sources in the background.",
    "Search a company or ticker",
    "Next",
    "Could not save your stocks. Please try again.",
    "No results. Try another company or ticker.",
  ],
  ko: [
    "관심 종목",
    "어떤 종목이 궁금하세요?",
    "관심 종목을 1~3개 선택해 주세요. 다음을 누르면 자료 준비를 시작하고, 리서치 요청 시 준비된 자료를 이어서 활용해요.",
    "회사명 또는 종목 코드 검색",
    "다음",
    "관심 종목을 저장하지 못했어요. 다시 시도해 주세요.",
    "검색 결과가 없어요. 다른 회사명이나 종목 코드를 입력해 주세요.",
  ],
  ja: [
    "関心のある銘柄",
    "どの銘柄が気になりますか？",
    "1〜3銘柄を選択してください。次へ進むと、調査資料の準備をバックグラウンドで開始します。",
    "会社名またはティッカーを検索",
    "次へ",
    "保存できませんでした。もう一度お試しください。",
    "該当する銘柄がありません。別の名前で検索してください。",
  ],
  "zh-TW": [
    "關注股票",
    "您關注哪些股票？",
    "請選擇 1–3 檔股票。繼續後，我們將在背景開始準備研究資料。",
    "搜尋公司或股票代碼",
    "下一步",
    "無法儲存，請再試一次。",
    "沒有搜尋結果，請嘗試其他名稱。",
  ],
  es: [
    "Tus intereses",
    "¿Qué acciones sigues?",
    "Elige de 1 a 3 acciones. Al continuar, prepararemos sus fuentes de investigación en segundo plano.",
    "Buscar empresa o símbolo",
    "Siguiente",
    "No se pudo guardar. Inténtalo de nuevo.",
    "Sin resultados. Prueba otro nombre.",
  ],
  "pt-BR": [
    "Seus interesses",
    "Quais ações você acompanha?",
    "Escolha de 1 a 3 ações. Ao continuar, prepararemos as fontes de pesquisa em segundo plano.",
    "Buscar empresa ou código",
    "Próximo",
    "Não foi possível salvar. Tente novamente.",
    "Nenhum resultado. Tente outro nome.",
  ],
  de: [
    "Deine Interessen",
    "Welche Aktien verfolgst du?",
    "Wähle 1–3 Aktien. Beim Fortfahren bereiten wir die Recherchequellen im Hintergrund vor.",
    "Unternehmen oder Ticker suchen",
    "Weiter",
    "Speichern fehlgeschlagen. Bitte erneut versuchen.",
    "Keine Ergebnisse. Bitte anders suchen.",
  ],
  fr: [
    "Vos intérêts",
    "Quelles actions suivez-vous ?",
    "Choisissez 1 à 3 actions. En continuant, nous préparerons leurs sources de recherche en arrière-plan.",
    "Rechercher une entreprise ou un symbole",
    "Suivant",
    "Enregistrement impossible. Réessayez.",
    "Aucun résultat. Essayez un autre nom.",
  ],
};

export function OnboardingStockPicker({
  locale,
  titleId,
  descriptionId,
  onNext,
}: {
  locale: AppLocale;
  titleId: string;
  descriptionId: string;
  onNext: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OnboardingStock[]>([]);
  const [selected, setSelected] = useState<OnboardingStock[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const text = copy[locale];
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const headers = await authHeaders();
        const response = await fetch("/api/account/onboarding/interests", {
          headers,
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) return;
        const payload = z
          .object({ stocks: z.array(OnboardingStockSchema).max(3) })
          .parse(await response.json());
        if (active && payload.stocks.length) {
          setSelected(payload.stocks);
          setSaved(true);
        }
      } catch {
        /* A failed read does not prevent a retryable Next submission. */
      } finally {
        if (active) setRestoring(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    setResults([]);
    setSearchError(false);
    if (!query.trim()) {
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      void fetch(
        `/api/research/tickers?q=${encodeURIComponent(query.trim())}`,
        { signal: controller.signal },
      )
        .then(async (response) => {
          if (!response.ok) throw new Error("SEARCH_FAILED");
          const payload = z
            .object({ tickers: z.array(OnboardingStockSchema) })
            .parse(await response.json());
          if (!controller.signal.aborted) setResults(payload.tickers);
        })
        .catch(() => {
          if (!controller.signal.aborted) setSearchError(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function next() {
    if (saving || selected.length < 1 || selected.length > 3) return;
    setSaving(true);
    setError(false);
    try {
      const headers = await authHeaders();
      headers.set("content-type", "application/json");
      const response = await fetch("/api/account/onboarding/interests", {
        method: "POST",
        headers,
        credentials: "same-origin",
        body: JSON.stringify({
          symbols: selected.map((stock) => stock.symbol),
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error("SAVE_FAILED");
      onNext();
    } catch {
      setError(true);
      setSaving(false);
    }
  }
  return (
    <>
      <p className="welcome-onboarding__eyebrow">{text[0]}</p>
      <h2 id={titleId}>{text[1]}</h2>
      <p id={descriptionId} className="welcome-onboarding__description">
        {text[2]}
      </p>
      <div className="onboarding-stocks">
        <label className="onboarding-stocks__search">
          <Search size={20} aria-hidden="true" />
          <input
            aria-label={text[3]}
            placeholder={text[3]}
            value={query}
            maxLength={64}
            disabled={saving || restoring || saved}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />
        </label>
        <div className="onboarding-stocks__selection" aria-live="polite">
          {selected.map((stock) => (
            <button
              key={stock.symbol}
              type="button"
              disabled={saving || restoring || saved}
              aria-label={`${stock.symbol} ×`}
              onClick={() =>
                setSelected((items) =>
                  items.filter((item) => item.symbol !== stock.symbol),
                )
              }
            >
              <strong>{stock.symbol}</strong>
              <span>{stock.company}</span>
              <X size={16} aria-hidden="true" />
            </button>
          ))}
          <span className="onboarding-stocks__count">
            {selected.length} / 3
          </span>
        </div>
        <div className="onboarding-stocks__results" aria-busy={searching}>
          {results.map((stock) => {
            const included = selected.some(
              (item) => item.symbol === stock.symbol,
            );
            return (
              <button
                key={stock.providerCode}
                type="button"
                disabled={
                  saving ||
                  restoring ||
                  saved ||
                  included ||
                  selected.length >= 3
                }
                onClick={() => {
                  setSelected((items) =>
                    items.some((item) => item.symbol === stock.symbol) ||
                    items.length >= 3
                      ? items
                      : [...items, stock],
                  );
                  setQuery("");
                }}
              >
                <strong>{stock.symbol}</strong>
                <span>{stock.company}</span>
                <small>{stock.exchange}</small>
              </button>
            );
          })}
          {query.trim() && !searching && !results.length ? (
            <p role="status">{searchError ? text[5] : text[6]}</p>
          ) : null}
        </div>
      </div>
      {error ? <p role="alert">{text[5]}</p> : null}
      <button
        type="button"
        className="welcome-onboarding__primary"
        disabled={saving || restoring || !selected.length}
        aria-busy={saving}
        onClick={() => void next()}
      >
        {text[4]}
        <ArrowRight aria-hidden="true" size={18} />
      </button>
    </>
  );
}

async function authHeaders(): Promise<Headers> {
  const tokens = await currentAuthTokens();
  const headers = new Headers();
  if (tokens.accessToken)
    headers.set("authorization", `Bearer ${tokens.accessToken}`);
  if (tokens.identityToken)
    headers.set("x-stocksembly-identity-token", tokens.identityToken);
  return headers;
}
