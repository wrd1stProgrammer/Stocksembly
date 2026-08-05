"use client";

import { useState } from "react";
import type { Locale } from "../lib/i18n";
import { copy } from "../lib/i18n";
import { Brand } from "./Brand";
import { LanguageToggle } from "./LanguageToggle";
import { SearchConsole } from "./SearchConsole";
import { ResearchButton, SearchField, TickerChip } from "./SearchPrimitives";

export function Showcase() {
  const [locale, setLocale] = useState<Locale>("en");
  const [value, setValue] = useState("");
  const labels = copy[locale].search;

  return (
    <main className="showcase">
      <header>
        <p>Stocksembly design system</p>
        <h1>Primitive states</h1>
      </header>
      <section>
        <h2>Wordmark</h2>
        <Brand locale={locale} />
      </section>
      <section>
        <h2>Language</h2>
        <LanguageToggle locale={locale} onChange={setLocale} />
      </section>
      <section>
        <h2>Ticker chips</h2>
        <div className="showcase__row">
          <TickerChip symbol="NVDA" selected={false} onSelect={setValue} />
          <TickerChip symbol="AAPL" selected onSelect={setValue} />
        </div>
      </section>
      <section>
        <h2>Search field</h2>
        <SearchField
          value={value}
          label={labels.label}
          placeholder={labels.placeholder}
          onChange={setValue}
          onKeyDown={() => undefined}
        />
      </section>
      <section>
        <h2>Populated, invalid, and disabled fields</h2>
        <div className="showcase__stack">
          <SearchField
            value="NVDA"
            label={labels.label}
            placeholder={labels.placeholder}
            onChange={() => undefined}
            onKeyDown={() => undefined}
          />
          <SearchField
            value="ZZZZ"
            label={labels.label}
            placeholder={labels.placeholder}
            invalid
            onChange={() => undefined}
            onKeyDown={() => undefined}
          />
          <SearchField
            value=""
            label={labels.label}
            placeholder={labels.placeholder}
            disabled
            onChange={() => undefined}
            onKeyDown={() => undefined}
          />
        </div>
      </section>
      <section>
        <h2>Research actions</h2>
        <div className="showcase__row">
          <ResearchButton
            label={labels.action}
            loadingLabel={labels.loading}
            disabled={false}
            loading={false}
          />
          <ResearchButton
            label={labels.action}
            loadingLabel={labels.loading}
            disabled={false}
            loading
          />
          <ResearchButton
            label={labels.action}
            loadingLabel={labels.loading}
            disabled
            loading={false}
          />
        </div>
      </section>
      <section>
        <h2>Search console</h2>
        <SearchConsole locale={locale} />
      </section>
    </main>
  );
}
