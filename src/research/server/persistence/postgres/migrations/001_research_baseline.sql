-- Baseline of research schema after SQLite migration 032.
-- JSON and timestamps remain text to preserve existing serialized payload hashes.
-- Foreign keys follow table creation because runs/snapshots/jobs/attempts are cyclic.

CREATE TABLE agent_output_commits (
  attempt_id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL UNIQUE,
  event_id TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL,
  fence_token INTEGER NOT NULL CHECK (fence_token > 0),
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 65),
  output_hash TEXT NOT NULL CHECK (
    length(output_hash) = 64 AND output_hash !~ '[^0-9a-f]'
  ),
  envelope_json TEXT NOT NULL CHECK ((envelope_json IS JSON)),
  committed_at TEXT NOT NULL
);

CREATE TABLE agent_runner_evidence (
  attempt_id TEXT PRIMARY KEY,
  stage TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  schema_hash TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  binary_hash TEXT NOT NULL,
  cli_version TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  model TEXT CHECK (
    model IS NULL OR
    model IN ('gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna')
  ),
  reasoning TEXT CHECK (
    reasoning IS NULL OR reasoning IN ('low', 'medium', 'high')
  ),
  browsing_policy TEXT CHECK (
    browsing_policy IS NULL OR
    browsing_policy IN ('disabled', 'audited_web')
  ),
  tool_transcript_hash TEXT CHECK (
    tool_transcript_hash IS NULL OR (
      length(tool_transcript_hash) = 64 AND
      tool_transcript_hash !~ '[^0-9a-f]'
    )
  ), tool_event_count INTEGER
  CHECK (tool_event_count IS NULL OR tool_event_count >= 0), input_tokens INTEGER
  CHECK (input_tokens IS NULL OR input_tokens >= 0), cached_input_tokens INTEGER
  CHECK (cached_input_tokens IS NULL OR cached_input_tokens >= 0), cache_write_input_tokens INTEGER
  CHECK (cache_write_input_tokens IS NULL OR cache_write_input_tokens >= 0), output_tokens INTEGER
  CHECK (output_tokens IS NULL OR output_tokens >= 0), reasoning_output_tokens INTEGER
  CHECK (
    reasoning_output_tokens IS NULL OR
    reasoning_output_tokens >= 0
  ),
  CHECK (length(prompt_hash) = 64 AND prompt_hash !~ '[^0-9a-f]'),
  CHECK (length(schema_hash) = 64 AND schema_hash !~ '[^0-9a-f]'),
  CHECK (length(input_hash) = 64 AND input_hash !~ '[^0-9a-f]'),
  CHECK (length(binary_hash) = 64 AND binary_hash !~ '[^0-9a-f]')
);

CREATE TABLE artifact_citation_metadata (
  artifact_id TEXT PRIMARY KEY,
  locator_json TEXT NOT NULL CHECK ((locator_json IS JSON))
);

CREATE TABLE artifact_edges (
  child_artifact_id TEXT NOT NULL,
  parent_artifact_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  PRIMARY KEY (child_artifact_id, parent_artifact_id, relation),
  CHECK (child_artifact_id <> parent_artifact_id)
);

CREATE TABLE "artifacts" (
  artifact_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (
    length(content_hash) = 64 AND content_hash !~ '[^0-9a-f]'
  ),
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  media_type TEXT NOT NULL,
  logical_key TEXT NOT NULL,
  input_hash TEXT NOT NULL CHECK (
    length(input_hash) = 64 AND input_hash !~ '[^0-9a-f]'
  ),
  created_at TEXT NOT NULL,
  UNIQUE (snapshot_id, content_hash),
  UNIQUE (run_id, logical_key)
);

CREATE TABLE attempt_web_evidence (
  attempt_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL UNIQUE,
  tool_transcript_hash TEXT NOT NULL CHECK (
    length(tool_transcript_hash) = 64 AND
    tool_transcript_hash !~ '[^0-9a-f]'
  ),
  source_url TEXT NOT NULL,
  title TEXT NOT NULL,
  publisher TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  PRIMARY KEY (attempt_id, artifact_id)
);

CREATE TABLE "attempts" (
  attempt_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('research', 'qa')),
  status TEXT NOT NULL CHECK (status IN (
    'created', 'spawn-reserved', 'running', 'unknown',
    'succeeded', 'failed', 'cancelled'
  )),
  logical_artifact_key TEXT NOT NULL,
  input_hash TEXT NOT NULL CHECK (
    length(input_hash) = 64 AND input_hash !~ '[^0-9a-f]'
  ),
  replacement_of_attempt_id TEXT UNIQUE,
  created_at TEXT NOT NULL,
  outcome TEXT CHECK (outcome IN ('accepted', 'failed', 'cancelled', 'unknown'))
, input_manifest_hash TEXT
  CHECK (input_manifest_hash IS NULL OR (
    length(input_manifest_hash) = 64 AND
    input_manifest_hash !~ '[^0-9a-f]'
  )));

CREATE TABLE auxiliary_codex_usage (
  call_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (
    purpose IN ('semantic_news_shortlist', 'semantic_news_detail')
  ),
  model TEXT NOT NULL CHECK (model = 'gpt-5.6-luna'),
  reasoning TEXT NOT NULL CHECK (reasoning = 'low'),
  tool_event_count INTEGER NOT NULL CHECK (tool_event_count >= 0),
  input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  cached_input_tokens INTEGER CHECK (
    cached_input_tokens IS NULL OR cached_input_tokens >= 0
  ),
  cache_write_input_tokens INTEGER CHECK (
    cache_write_input_tokens IS NULL OR cache_write_input_tokens >= 0
  ),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  reasoning_output_tokens INTEGER CHECK (
    reasoning_output_tokens IS NULL OR reasoning_output_tokens >= 0
  ),
  recorded_at TEXT NOT NULL
);

CREATE TABLE idempotency_records (
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  request_hash TEXT NOT NULL CHECK (
    length(request_hash) = 64 AND request_hash !~ '[^0-9a-f]'
  ),
  result_json TEXT NOT NULL CHECK ((result_json IS JSON)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (scope, idempotency_key)
);

CREATE TABLE job_input_artifacts (
  job_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  PRIMARY KEY (job_id, artifact_id)
);

CREATE TABLE jobs (
  job_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('research', 'qa')),
  logical_key TEXT NOT NULL,
  input_hash TEXT NOT NULL CHECK (
    length(input_hash) = 64 AND input_hash !~ '[^0-9a-f]'
  ),
  status TEXT NOT NULL CHECK (status IN (
    'queued', 'leased', 'spawn-reserved', 'running', 'retry-wait',
    'cancel-requested', 'cancelled', 'succeeded', 'failed'
  )),
  created_at TEXT NOT NULL,
  attempt_id TEXT UNIQUE,
  lease_owner TEXT,
  lease_token INTEGER NOT NULL DEFAULT 0 CHECK (lease_token >= 0),
  lease_expires_at TEXT,
  result_artifact_id TEXT, input_manifest_hash TEXT
  CHECK (input_manifest_hash IS NULL OR (
    length(input_manifest_hash) = 64 AND
    input_manifest_hash !~ '[^0-9a-f]'
  )),
  UNIQUE (run_id, logical_key),
  UNIQUE (run_id, input_hash),
  CHECK (
    (lease_owner IS NULL AND lease_expires_at IS NULL) OR
    (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL AND lease_token > 0)
  )
);

CREATE TABLE maintenance_leases (
  lease_name TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('draining', 'quiesced')),
  fencing_token INTEGER NOT NULL CHECK (fencing_token > 0),
  expires_at TEXT NOT NULL,
  maintenance_epoch INTEGER NOT NULL DEFAULT 0 CHECK (maintenance_epoch >= 0),
  completed_at TEXT
);

CREATE TABLE question_call_ordinals (
  report_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 20),
  question_id TEXT NOT NULL UNIQUE,
  job_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL UNIQUE,
  input_hash TEXT NOT NULL,
  reserved_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'burned' CHECK (state = 'burned'),
  PRIMARY KEY (report_id, ordinal)
);

CREATE TABLE question_runner_evidence (
  attempt_id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL UNIQUE,
  report_id TEXT NOT NULL,
  report_version_id TEXT NOT NULL,
  report_artifact_id TEXT NOT NULL,
  report_artifact_digest TEXT NOT NULL CHECK (
    length(report_artifact_digest) = 64
    AND report_artifact_digest !~ '[^0-9a-f]'
  ),
  input_hash TEXT NOT NULL CHECK (
    length(input_hash) = 64 AND input_hash !~ '[^0-9a-f]'
  ),
  prompt_hash TEXT NOT NULL CHECK (
    length(prompt_hash) = 64 AND prompt_hash !~ '[^0-9a-f]'
  ),
  schema_hash TEXT NOT NULL CHECK (
    length(schema_hash) = 64 AND schema_hash !~ '[^0-9a-f]'
  ),
  binary_hash TEXT NOT NULL CHECK (
    length(binary_hash) = 64 AND binary_hash !~ '[^0-9a-f]'
  ),
  cli_version TEXT NOT NULL,
  committed_at TEXT NOT NULL
);

CREATE TABLE questions (
  question_id TEXT PRIMARY KEY,
  retry_of_question_id TEXT,
  report_id TEXT NOT NULL,
  report_version_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  job_id TEXT NOT NULL UNIQUE,
  attempt_ordinal INTEGER NOT NULL CHECK (attempt_ordinal BETWEEN 1 AND 20),
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'spawn_reserved', 'running', 'answered', 'failed')
  ),
  question_json TEXT NOT NULL CHECK ((question_json IS JSON)),
  answer_json TEXT CHECK (answer_json IS NULL OR (answer_json IS JSON)),
  created_at TEXT NOT NULL,
  UNIQUE (report_id, attempt_ordinal),
  CHECK (question_id <> retry_of_question_id),
  CHECK ((status = 'answered') = (answer_json IS NOT NULL))
);

CREATE TABLE report_follow_up_versions (
  report_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 1),
  child_run_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'allocated' CHECK (
    status IN ('allocated', 'published', 'failed')
  ),
  created_at TEXT NOT NULL,
  PRIMARY KEY (report_id, version)
);

CREATE TABLE report_versions (
  version_id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  artifact_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('complete', 'complete_with_limitations', 'incomplete')
  ),
  published_at TEXT NOT NULL,
  public_payload_json TEXT NOT NULL CHECK ((public_payload_json IS JSON)),
  UNIQUE (report_id, version)
);

CREATE TABLE reports (
  report_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  snapshot_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('draft', 'published')),
  created_at TEXT NOT NULL
);

CREATE TABLE research_call_ordinals (
  run_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 65),
  job_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL UNIQUE,
  logical_artifact_key TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  reserved_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'burned' CHECK (state = 'burned'),
  PRIMARY KEY (run_id, ordinal)
);

CREATE TABLE research_quality_observations (
  run_id TEXT PRIMARY KEY,
  workflow_version TEXT NOT NULL,
  report_version TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN (
    'complete', 'item_omitted', 'quality_degraded', 'run_failed'
  )),
  observed_at TEXT NOT NULL,
  metrics_json TEXT NOT NULL CHECK (
    (metrics_json IS JSON) AND json_typeof(metrics_json::json) = 'object'
  ),
  reason_codes_json TEXT NOT NULL CHECK (
    (reason_codes_json IS JSON) AND json_typeof(reason_codes_json::json) = 'array'
  )
);

CREATE TABLE research_question_localizations (
  run_id TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN (
    'en', 'ko', 'ja', 'zh-TW', 'es', 'pt-BR', 'de', 'fr'
  )),
  question TEXT NOT NULL CHECK (length(trim(question)) > 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (run_id, locale)
);

CREATE TABLE research_report_translations (
  report_id TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN (
    'en', 'ko', 'ja', 'zh-TW', 'es', 'pt-BR', 'de', 'fr'
  )),
  source_locale TEXT CHECK (source_locale IS NULL OR source_locale IN ('en', 'ko')),
  report_version INTEGER CHECK (report_version IS NULL OR report_version > 0),
  source_content_hash TEXT CHECK (
    source_content_hash IS NULL OR (
      length(source_content_hash) = 64 AND
      source_content_hash !~ '[^0-9a-f]'
    )
  ),
  translation_schema_version INTEGER CHECK (
    translation_schema_version IS NULL OR translation_schema_version > 0
  ),
  model_version TEXT,
  file_json TEXT NOT NULL CHECK ((file_json IS JSON)),
  created_at TEXT NOT NULL
);

CREATE TABLE "research_requests" (
  run_id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL CHECK (
    length(principal_id) = 64 AND principal_id !~ '[^0-9a-f]'
  ),
  symbol TEXT NOT NULL CHECK (
    length(symbol) BETWEEN 1 AND 12
    AND symbol ~ '^[A-Z]'
    AND symbol !~ '[^A-Z0-9.-]'
  ),
  question TEXT NOT NULL CHECK (length(question) <= 4000),
  locale TEXT NOT NULL CHECK (locale IN ('en', 'ko')),
  request_hash TEXT NOT NULL CHECK (
    length(request_hash) = 64 AND request_hash !~ '[^0-9a-f]'
  ),
  created_at TEXT NOT NULL
, research_kind TEXT NOT NULL DEFAULT 'committee'
  CHECK (research_kind IN ('committee', 'department')), department_id TEXT
  CHECK (department_id IN ('market', 'company', 'financial', 'risk')), research_profile_json TEXT NOT NULL DEFAULT '{"investmentHorizon":"medium","counterargumentIntensity":"standard","analysisDepth":"standard","decisionPurpose":"new_entry","comparisonSymbols":[]}');

CREATE TABLE research_room_views (
  report_id TEXT PRIMARY KEY,
  view_count INTEGER NOT NULL CHECK (view_count >= 0),
  last_viewed_at TEXT NOT NULL
);

CREATE TABLE research_translation_model_calls (
  invocation_id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  report_version INTEGER NOT NULL CHECK (report_version > 0),
  source_content_hash TEXT NOT NULL CHECK (
    length(source_content_hash) = 64 AND
    source_content_hash !~ '[^0-9a-f]'
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
    batch_input_hash !~ '[^0-9a-f]'
  ),
  outcome TEXT NOT NULL CHECK (outcome IN ('started', 'succeeded', 'failed')),
  created_at TEXT NOT NULL
);

CREATE TABLE run_events (
  run_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  state_id TEXT NOT NULL,
  job_id TEXT,
  attempt_id TEXT,
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK ((payload_json IS JSON)),
  PRIMARY KEY (run_id, sequence)
);

CREATE TABLE run_lineage (
  child_run_id TEXT PRIMARY KEY,
  parent_run_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('same-snapshot-retry', 'new-snapshot-follow-up')),
  effective_snapshot_id TEXT NOT NULL,
  prior_report_id TEXT,
  created_at TEXT NOT NULL,
  CHECK (child_run_id <> parent_run_id)
);

CREATE TABLE run_public_limitations (
  run_id TEXT NOT NULL,
  code TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK ((payload_json IS JSON)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (run_id, code)
);

CREATE TABLE run_stage_recoveries (
  run_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_code TEXT NOT NULL,
  next_retry_at TEXT NOT NULL,
  exhausted INTEGER NOT NULL DEFAULT 0 CHECK (exhausted IN (0, 1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, stage),
  CHECK (failure_count >= 0)
);

CREATE TABLE "runs" (
  run_id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'queued', 'running', 'cancelling', 'completed',
    'complete-with-limitations', 'cancelled', 'failed', 'incomplete'
  )),
  last_event_seq INTEGER NOT NULL DEFAULT 0 CHECK (last_event_seq >= 0),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  remaining_base_calls INTEGER NOT NULL DEFAULT 24 CHECK (remaining_base_calls >= 0),
  requested_optional_calls INTEGER NOT NULL DEFAULT 3 CHECK (requested_optional_calls >= 0),
  requested_replacement_calls INTEGER NOT NULL DEFAULT 3 CHECK (requested_replacement_calls >= 0),
  created_at TEXT NOT NULL,
  report_id TEXT,
  report_published_at TEXT, execution_backend TEXT NOT NULL DEFAULT 'subscription'
  CHECK (execution_backend IN ('subscription', 'api')), last_scheduled_at TEXT,
  CHECK ((report_id IS NULL) = (report_published_at IS NULL))
);

CREATE TABLE snapshots (
  snapshot_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('collecting', 'sealed', 'failed')),
  requested_at TEXT NOT NULL,
  evidence_cutoff_at TEXT,
  sealed_at TEXT
);

CREATE TABLE symbol_registry (
  provider_code TEXT PRIMARY KEY CHECK (
    length(provider_code) BETWEEN 3 AND 64
    AND position(':' in provider_code) > 0
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
  aliases_json TEXT NOT NULL CHECK ((aliases_json IS JSON)),
  last_verified_at TEXT NOT NULL
);

CREATE TABLE symbol_registry_aliases (
  normalized_alias TEXT NOT NULL CHECK (
    length(normalized_alias) BETWEEN 1 AND 512
  ),
  provider_code TEXT NOT NULL,
  PRIMARY KEY(normalized_alias, provider_code)
);

ALTER TABLE agent_output_commits ADD FOREIGN KEY (attempt_id) REFERENCES attempts(attempt_id);
ALTER TABLE agent_output_commits ADD FOREIGN KEY (artifact_id) REFERENCES artifacts(artifact_id);
ALTER TABLE agent_output_commits ADD FOREIGN KEY (event_id) REFERENCES run_events(event_id);
ALTER TABLE agent_runner_evidence ADD FOREIGN KEY (attempt_id) REFERENCES attempts(attempt_id) ON DELETE CASCADE;
ALTER TABLE artifact_citation_metadata ADD FOREIGN KEY (artifact_id) REFERENCES artifacts(artifact_id) ON DELETE CASCADE;
ALTER TABLE artifact_edges ADD FOREIGN KEY (child_artifact_id) REFERENCES artifacts(artifact_id) ON DELETE CASCADE;
ALTER TABLE artifact_edges ADD FOREIGN KEY (parent_artifact_id) REFERENCES artifacts(artifact_id);
ALTER TABLE artifacts ADD FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE;
ALTER TABLE artifacts ADD FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id);
ALTER TABLE attempt_web_evidence ADD FOREIGN KEY (attempt_id) REFERENCES attempts(attempt_id) ON DELETE CASCADE;
ALTER TABLE attempt_web_evidence ADD FOREIGN KEY (artifact_id) REFERENCES artifacts(artifact_id) ON DELETE CASCADE;
ALTER TABLE attempts ADD FOREIGN KEY (job_id) REFERENCES jobs(job_id) ON DELETE CASCADE;
ALTER TABLE attempts ADD FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE;
ALTER TABLE attempts ADD FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id);
ALTER TABLE attempts ADD FOREIGN KEY (replacement_of_attempt_id) REFERENCES "attempts"(attempt_id);
ALTER TABLE auxiliary_codex_usage ADD FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE;
ALTER TABLE job_input_artifacts ADD FOREIGN KEY (job_id) REFERENCES jobs(job_id) ON DELETE CASCADE;
ALTER TABLE job_input_artifacts ADD FOREIGN KEY (artifact_id) REFERENCES artifacts(artifact_id);
ALTER TABLE jobs ADD FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE;
ALTER TABLE jobs ADD FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id);
ALTER TABLE jobs ADD FOREIGN KEY (attempt_id) REFERENCES attempts(attempt_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE jobs ADD FOREIGN KEY (result_artifact_id) REFERENCES artifacts(artifact_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE question_call_ordinals ADD FOREIGN KEY (report_id) REFERENCES reports(report_id) ON DELETE CASCADE;
ALTER TABLE question_call_ordinals ADD FOREIGN KEY (question_id) REFERENCES questions(question_id) ON DELETE CASCADE;
ALTER TABLE question_call_ordinals ADD FOREIGN KEY (job_id) REFERENCES jobs(job_id) ON DELETE CASCADE;
ALTER TABLE question_call_ordinals ADD FOREIGN KEY (attempt_id) REFERENCES attempts(attempt_id) ON DELETE CASCADE;
ALTER TABLE question_runner_evidence ADD FOREIGN KEY (attempt_id) REFERENCES attempts(attempt_id) ON DELETE CASCADE;
ALTER TABLE question_runner_evidence ADD FOREIGN KEY (question_id) REFERENCES questions(question_id) ON DELETE CASCADE;
ALTER TABLE question_runner_evidence ADD FOREIGN KEY (report_id) REFERENCES reports(report_id) ON DELETE CASCADE;
ALTER TABLE question_runner_evidence ADD FOREIGN KEY (report_version_id) REFERENCES report_versions(version_id);
ALTER TABLE question_runner_evidence ADD FOREIGN KEY (report_artifact_id) REFERENCES artifacts(artifact_id);
ALTER TABLE questions ADD FOREIGN KEY (retry_of_question_id) REFERENCES questions(question_id);
ALTER TABLE questions ADD FOREIGN KEY (report_id) REFERENCES reports(report_id) ON DELETE CASCADE;
ALTER TABLE questions ADD FOREIGN KEY (report_version_id) REFERENCES report_versions(version_id);
ALTER TABLE questions ADD FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE;
ALTER TABLE questions ADD FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id);
ALTER TABLE questions ADD FOREIGN KEY (job_id) REFERENCES jobs(job_id);
ALTER TABLE report_follow_up_versions ADD FOREIGN KEY (report_id) REFERENCES reports(report_id) ON DELETE CASCADE;
ALTER TABLE report_follow_up_versions ADD FOREIGN KEY (child_run_id) REFERENCES runs(run_id) ON DELETE CASCADE;
ALTER TABLE report_versions ADD FOREIGN KEY (report_id) REFERENCES reports(report_id) ON DELETE CASCADE;
ALTER TABLE report_versions ADD FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE;
ALTER TABLE report_versions ADD FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id);
ALTER TABLE report_versions ADD FOREIGN KEY (artifact_id) REFERENCES artifacts(artifact_id);
ALTER TABLE reports ADD FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE;
ALTER TABLE reports ADD FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id);
ALTER TABLE research_call_ordinals ADD FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE;
ALTER TABLE research_call_ordinals ADD FOREIGN KEY (job_id) REFERENCES jobs(job_id) ON DELETE CASCADE;
ALTER TABLE research_call_ordinals ADD FOREIGN KEY (attempt_id) REFERENCES attempts(attempt_id) ON DELETE CASCADE;
ALTER TABLE research_quality_observations ADD FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE;
ALTER TABLE research_question_localizations ADD FOREIGN KEY (run_id) REFERENCES research_requests(run_id) ON DELETE CASCADE;
ALTER TABLE research_report_translations ADD FOREIGN KEY (report_id) REFERENCES reports(report_id) ON DELETE CASCADE;
ALTER TABLE research_requests ADD FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE;
ALTER TABLE research_room_views ADD FOREIGN KEY (report_id) REFERENCES reports(report_id) ON DELETE CASCADE;
ALTER TABLE research_translation_model_calls ADD FOREIGN KEY (report_id) REFERENCES reports(report_id) ON DELETE CASCADE;
ALTER TABLE run_events ADD FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE;
ALTER TABLE run_events ADD FOREIGN KEY (job_id) REFERENCES jobs(job_id);
ALTER TABLE run_events ADD FOREIGN KEY (attempt_id) REFERENCES attempts(attempt_id);
ALTER TABLE run_lineage ADD FOREIGN KEY (child_run_id) REFERENCES runs(run_id) ON DELETE CASCADE;
ALTER TABLE run_lineage ADD FOREIGN KEY (parent_run_id) REFERENCES runs(run_id);
ALTER TABLE run_lineage ADD FOREIGN KEY (effective_snapshot_id) REFERENCES snapshots(snapshot_id);
ALTER TABLE run_lineage ADD FOREIGN KEY (prior_report_id) REFERENCES reports(report_id);
ALTER TABLE run_public_limitations ADD FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE;
ALTER TABLE run_stage_recoveries ADD FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE;
ALTER TABLE runs ADD FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE runs ADD FOREIGN KEY (report_id) REFERENCES reports(report_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE snapshots ADD FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE symbol_registry_aliases ADD FOREIGN KEY (provider_code) REFERENCES symbol_registry(provider_code)
    ON DELETE CASCADE;

CREATE INDEX attempt_web_evidence_attempt_idx
  ON attempt_web_evidence(attempt_id, artifact_id);
CREATE INDEX attempts_recovery_idx ON attempts(status, run_id);
CREATE INDEX auxiliary_codex_usage_run_idx
  ON auxiliary_codex_usage(run_id, recorded_at);
CREATE INDEX jobs_ready_idx ON jobs(status, created_at);
CREATE INDEX questions_report_idx ON questions(report_id, attempt_ordinal);
CREATE INDEX report_follow_up_versions_child_idx
  ON report_follow_up_versions(child_run_id);
CREATE INDEX report_versions_history_idx ON report_versions(report_id, version);
CREATE INDEX research_quality_observations_outcome_idx
  ON research_quality_observations(outcome, observed_at);
CREATE UNIQUE INDEX research_report_translation_cache_key
ON research_report_translations(
  report_id, report_version, source_content_hash, source_locale, locale,
  translation_schema_version, model_version
);
CREATE INDEX research_requests_comparable_reports_idx
  ON research_requests(
    principal_id,
    symbol,
    research_kind,
    department_id,
    created_at DESC
  );
CREATE INDEX research_requests_history_idx
  ON research_requests(principal_id, created_at DESC, run_id DESC);
CREATE INDEX research_room_views_popular_idx
  ON research_room_views(view_count DESC, last_viewed_at DESC);
CREATE INDEX run_events_cursor_idx ON run_events(run_id, sequence);
CREATE INDEX run_stage_recoveries_due_idx
  ON run_stage_recoveries(exhausted, next_retry_at);
CREATE INDEX runs_execution_capacity_idx ON runs(status, execution_backend, created_at);
CREATE INDEX symbol_registry_name_idx
  ON symbol_registry(lower(name), status, provider_code);
CREATE INDEX symbol_registry_ticker_idx
  ON symbol_registry(user_ticker, status, provider_code);

-- Serialize validation per run so concurrent inserts cannot both pass a budget
-- or event sequence check. Repositories take the same lock before allocating.
CREATE FUNCTION validate_attempt_insert() RETURNS trigger LANGUAGE plpgsql SET search_path = research, pg_catalog AS $$
BEGIN
  PERFORM 1 FROM runs WHERE run_id = NEW.run_id FOR UPDATE;
  IF NEW.input_hash <> (SELECT input_hash FROM jobs WHERE job_id = NEW.job_id) THEN
    RAISE EXCEPTION 'attempt input hash does not match durable job input' USING ERRCODE = '23514';
  END IF;
  IF NEW.replacement_of_attempt_id IS NOT NULL THEN
    IF (SELECT count(*) FROM attempts WHERE run_id = NEW.run_id AND replacement_of_attempt_id IS NOT NULL) >= 12 THEN
      RAISE EXCEPTION 'research replacement budget exhausted' USING ERRCODE = '23514';
    END IF;
    IF (SELECT count(*) FROM attempts WHERE run_id = NEW.run_id AND logical_artifact_key = NEW.logical_artifact_key AND replacement_of_attempt_id IS NOT NULL) >= 3 THEN
      RAISE EXCEPTION 'logical artifact replacement limit exceeded' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER attempts_validate BEFORE INSERT ON attempts
FOR EACH ROW EXECUTE FUNCTION validate_attempt_insert();

CREATE FUNCTION validate_run_event_insert() RETURNS trigger LANGUAGE plpgsql SET search_path = research, pg_catalog AS $$
DECLARE high_water_mark integer;
BEGIN
  SELECT last_event_seq INTO high_water_mark FROM runs WHERE run_id = NEW.run_id FOR UPDATE;
  IF NEW.sequence <> COALESCE((SELECT max(sequence) + 1 FROM run_events WHERE run_id = NEW.run_id), 1) THEN
    RAISE EXCEPTION 'run event sequence is not contiguous' USING ERRCODE = '23514';
  END IF;
  IF NEW.sequence <> high_water_mark THEN
    RAISE EXCEPTION 'run event sequence does not match high-water mark' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER run_events_contiguous BEFORE INSERT ON run_events
FOR EACH ROW EXECUTE FUNCTION validate_run_event_insert();
