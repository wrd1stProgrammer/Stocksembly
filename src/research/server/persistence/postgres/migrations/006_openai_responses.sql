ALTER TABLE agent_runner_evidence DROP CONSTRAINT agent_runner_evidence_model_check;
ALTER TABLE agent_runner_evidence ADD CONSTRAINT agent_runner_evidence_model_check
  CHECK (model IS NULL OR model IN ('gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-6-luna'));
ALTER TABLE auxiliary_codex_usage DROP CONSTRAINT auxiliary_codex_usage_model_check;
ALTER TABLE auxiliary_codex_usage ADD CONSTRAINT auxiliary_codex_usage_model_check
  CHECK (model IN ('gpt-5.6-luna', 'gpt-6-luna'));
ALTER TABLE auxiliary_codex_usage DROP CONSTRAINT auxiliary_codex_usage_purpose_check;
ALTER TABLE auxiliary_codex_usage ADD CONSTRAINT auxiliary_codex_usage_purpose_check
  CHECK (purpose IN ('semantic_news_shortlist', 'semantic_news_detail', 'research_brief'));
ALTER TABLE auxiliary_codex_usage DROP CONSTRAINT auxiliary_codex_usage_reasoning_check;
ALTER TABLE auxiliary_codex_usage ADD CONSTRAINT auxiliary_codex_usage_reasoning_check
  CHECK (reasoning IN ('low', 'medium'));
