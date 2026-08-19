ALTER TABLE agent_runner_evidence ADD COLUMN tool_event_count INTEGER
  CHECK (tool_event_count IS NULL OR tool_event_count >= 0);
ALTER TABLE agent_runner_evidence ADD COLUMN input_tokens INTEGER
  CHECK (input_tokens IS NULL OR input_tokens >= 0);
ALTER TABLE agent_runner_evidence ADD COLUMN cached_input_tokens INTEGER
  CHECK (cached_input_tokens IS NULL OR cached_input_tokens >= 0);
ALTER TABLE agent_runner_evidence ADD COLUMN cache_write_input_tokens INTEGER
  CHECK (cache_write_input_tokens IS NULL OR cache_write_input_tokens >= 0);
ALTER TABLE agent_runner_evidence ADD COLUMN output_tokens INTEGER
  CHECK (output_tokens IS NULL OR output_tokens >= 0);
ALTER TABLE agent_runner_evidence ADD COLUMN reasoning_output_tokens INTEGER
  CHECK (
    reasoning_output_tokens IS NULL OR
    reasoning_output_tokens >= 0
  );
