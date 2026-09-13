CREATE TABLE IF NOT EXISTS news_events (
    symbol TEXT NOT NULL,
    event_key TEXT NOT NULL,
    direction TEXT NOT NULL,
    category TEXT NOT NULL,
    team_relevance_json TEXT NOT NULL,
    relevance DOUBLE PRECISION NOT NULL,
    horizon TEXT NOT NULL,
    verification_need TEXT NOT NULL,
    title TEXT NOT NULL,
    published_at TEXT NOT NULL,
    source TEXT,
    link TEXT,
    excerpt TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    PRIMARY KEY(symbol, event_key, direction)
  );
  CREATE INDEX IF NOT EXISTS news_events_symbol_published
    ON news_events(symbol, published_at DESC);
  CREATE TABLE IF NOT EXISTS news_candidate_classifications (
    symbol TEXT NOT NULL,
    candidate_id TEXT NOT NULL,
    classifier_version TEXT NOT NULL,
    decision_status TEXT NOT NULL CHECK(decision_status IN ('detailed', 'screened_out')),
    classification_json TEXT NOT NULL,
    published_at TEXT NOT NULL,
    classified_at TEXT NOT NULL,
    PRIMARY KEY(symbol, candidate_id, classifier_version)
  );
  CREATE INDEX IF NOT EXISTS news_candidate_classifications_symbol_published
    ON news_candidate_classifications(symbol, published_at DESC);
