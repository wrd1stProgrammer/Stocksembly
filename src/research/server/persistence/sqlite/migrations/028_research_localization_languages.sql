ALTER TABLE research_question_localizations
  RENAME TO research_question_localizations_v27;

CREATE TABLE research_question_localizations (
  run_id TEXT NOT NULL REFERENCES research_requests(run_id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN (
    'en', 'ko', 'ja', 'zh-TW', 'es', 'pt-BR', 'de', 'fr'
  )),
  question TEXT NOT NULL CHECK (length(trim(question)) > 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (run_id, locale)
) STRICT;

INSERT INTO research_question_localizations(run_id, locale, question, created_at)
SELECT run_id, locale, question, created_at
FROM research_question_localizations_v27;

DROP TABLE research_question_localizations_v27;

ALTER TABLE research_report_translations
  RENAME TO research_report_translations_v27;

CREATE TABLE research_report_translations (
  report_id TEXT NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN (
    'en', 'ko', 'ja', 'zh-TW', 'es', 'pt-BR', 'de', 'fr'
  )),
  file_json TEXT NOT NULL CHECK (json_valid(file_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (report_id, locale)
) STRICT;

INSERT INTO research_report_translations(report_id, locale, file_json, created_at)
SELECT report_id, locale, file_json, created_at
FROM research_report_translations_v27;

DROP TABLE research_report_translations_v27;
