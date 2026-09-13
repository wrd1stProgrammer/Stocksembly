CREATE TABLE storage_imports (
  manifest_sha256 text PRIMARY KEY CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  source_schema_version integer NOT NULL,
  source_tables_json text NOT NULL CHECK (source_tables_json IS JSON ARRAY),
  imported_at timestamptz NOT NULL DEFAULT now()
);
