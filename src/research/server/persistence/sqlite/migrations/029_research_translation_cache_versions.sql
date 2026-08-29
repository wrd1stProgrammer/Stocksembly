ALTER TABLE research_report_translations
  RENAME TO research_report_translations_v28;

CREATE TABLE research_report_translations (
  report_id TEXT NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN (
    'en', 'ko', 'ja', 'zh-TW', 'es', 'pt-BR', 'de', 'fr'
  )),
  source_locale TEXT CHECK (source_locale IS NULL OR source_locale IN ('en', 'ko')),
  report_version INTEGER CHECK (report_version IS NULL OR report_version > 0),
  source_content_hash TEXT CHECK (
    source_content_hash IS NULL OR (
      length(source_content_hash) = 64 AND
      source_content_hash NOT GLOB '*[^0-9a-f]*'
    )
  ),
  translation_schema_version INTEGER CHECK (
    translation_schema_version IS NULL OR translation_schema_version > 0
  ),
  model_version TEXT,
  file_json TEXT NOT NULL CHECK (json_valid(file_json)),
  created_at TEXT NOT NULL
) STRICT;

INSERT INTO research_report_translations(
  report_id, locale, file_json, created_at
)
SELECT report_id, locale, file_json, created_at
FROM research_report_translations_v28;

DROP TABLE research_report_translations_v28;

CREATE UNIQUE INDEX research_report_translation_cache_key
ON research_report_translations(
  report_id, report_version, source_content_hash, source_locale, locale,
  translation_schema_version, model_version
);

CREATE TABLE research_translation_model_calls (
  invocation_id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,
  report_version INTEGER NOT NULL CHECK (report_version > 0),
  source_content_hash TEXT NOT NULL CHECK (
    length(source_content_hash) = 64 AND
    source_content_hash NOT GLOB '*[^0-9a-f]*'
  ),
  source_locale TEXT NOT NULL CHECK (source_locale IN ('en', 'ko')),
  target_locale TEXT NOT NULL CHECK (target_locale IN (
    'en', 'ko', 'ja', 'zh-TW', 'es', 'pt-BR', 'de', 'fr'
  )),
  translation_schema_version INTEGER NOT NULL CHECK (translation_schema_version > 0),
  model_version TEXT NOT NULL CHECK (length(trim(model_version)) > 0),
  batch_ordinal INTEGER NOT NULL CHECK (batch_ordinal > 0),
  batch_input_hash TEXT NOT NULL CHECK (
    length(batch_input_hash) = 64 AND
    batch_input_hash NOT GLOB '*[^0-9a-f]*'
  ),
  outcome TEXT NOT NULL CHECK (outcome IN ('started', 'succeeded', 'failed')),
  created_at TEXT NOT NULL
) STRICT;
