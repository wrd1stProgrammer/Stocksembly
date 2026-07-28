ALTER TABLE agent_runner_evidence ADD COLUMN model TEXT
  CHECK (model IS NULL OR model = 'gpt-5.6-sol');

ALTER TABLE agent_runner_evidence ADD COLUMN reasoning TEXT
  CHECK (reasoning IS NULL OR reasoning IN ('medium', 'high'));

ALTER TABLE agent_runner_evidence ADD COLUMN browsing_policy TEXT
  CHECK (browsing_policy IS NULL OR browsing_policy = 'disabled');

ALTER TABLE agent_runner_evidence ADD COLUMN tool_transcript_hash TEXT
  CHECK (tool_transcript_hash IS NULL OR (
    length(tool_transcript_hash) = 64 AND
    tool_transcript_hash NOT GLOB '*[^0-9a-f]*'
  ));
