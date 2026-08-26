CREATE TABLE research_question_localizations (
  run_id TEXT NOT NULL REFERENCES research_requests(run_id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'ko')),
  question TEXT NOT NULL CHECK (length(trim(question)) > 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (run_id, locale)
) STRICT;

CREATE TABLE research_report_translations (
  report_id TEXT NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'ko')),
  file_json TEXT NOT NULL CHECK (json_valid(file_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (report_id, locale)
) STRICT;
