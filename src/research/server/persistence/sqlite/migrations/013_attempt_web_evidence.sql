ALTER TABLE agent_runner_evidence RENAME TO agent_runner_evidence_v11;

CREATE TABLE agent_runner_evidence (
  attempt_id TEXT PRIMARY KEY REFERENCES attempts(attempt_id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  schema_hash TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  binary_hash TEXT NOT NULL,
  cli_version TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  model TEXT CHECK (model IS NULL OR model = 'gpt-5.6-sol'),
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
      tool_transcript_hash NOT GLOB '*[^0-9a-f]*'
    )
  ),
  CHECK (length(prompt_hash) = 64 AND prompt_hash NOT GLOB '*[^0-9a-f]*'),
  CHECK (length(schema_hash) = 64 AND schema_hash NOT GLOB '*[^0-9a-f]*'),
  CHECK (length(input_hash) = 64 AND input_hash NOT GLOB '*[^0-9a-f]*'),
  CHECK (length(binary_hash) = 64 AND binary_hash NOT GLOB '*[^0-9a-f]*')
) STRICT;

INSERT INTO agent_runner_evidence
SELECT * FROM agent_runner_evidence_v11;

DROP TABLE agent_runner_evidence_v11;

CREATE TABLE attempt_web_evidence (
  attempt_id TEXT NOT NULL REFERENCES attempts(attempt_id) ON DELETE CASCADE,
  artifact_id TEXT NOT NULL UNIQUE REFERENCES artifacts(artifact_id) ON DELETE CASCADE,
  tool_transcript_hash TEXT NOT NULL CHECK (
    length(tool_transcript_hash) = 64 AND
    tool_transcript_hash NOT GLOB '*[^0-9a-f]*'
  ),
  source_url TEXT NOT NULL,
  title TEXT NOT NULL,
  publisher TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  PRIMARY KEY (attempt_id, artifact_id)
) STRICT;

CREATE INDEX attempt_web_evidence_attempt_idx
  ON attempt_web_evidence(attempt_id, artifact_id);
