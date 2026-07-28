CREATE TABLE symbol_registry (
  provider_code TEXT PRIMARY KEY CHECK (
    length(provider_code) BETWEEN 3 AND 64
    AND provider_code GLOB '*:*'
  ),
  user_ticker TEXT NOT NULL CHECK (
    length(user_ticker) BETWEEN 1 AND 24
    AND user_ticker = upper(user_ticker)
  ),
  exchange TEXT NOT NULL CHECK (
    exchange IN ('NASDAQ', 'NYSE', 'NYSE_AMERICAN')
  ),
  security_type TEXT NOT NULL CHECK (length(security_type) BETWEEN 1 AND 64),
  currency TEXT NOT NULL CHECK (
    length(currency) = 3 AND currency = upper(currency)
  ),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 512),
  status TEXT NOT NULL CHECK (
    status IN ('active', 'delisted', 'unsupported')
  ),
  aliases_json TEXT NOT NULL CHECK (json_valid(aliases_json)),
  last_verified_at TEXT NOT NULL
) STRICT;

CREATE TABLE symbol_registry_aliases (
  normalized_alias TEXT NOT NULL CHECK (
    length(normalized_alias) BETWEEN 1 AND 512
  ),
  provider_code TEXT NOT NULL REFERENCES symbol_registry(provider_code)
    ON DELETE CASCADE,
  PRIMARY KEY(normalized_alias, provider_code)
) STRICT;

CREATE INDEX symbol_registry_ticker_idx
  ON symbol_registry(user_ticker, status, provider_code);
CREATE INDEX symbol_registry_name_idx
  ON symbol_registry(name COLLATE NOCASE, status, provider_code);
