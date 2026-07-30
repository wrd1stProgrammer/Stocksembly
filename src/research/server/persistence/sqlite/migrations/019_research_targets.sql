ALTER TABLE research_requests
  ADD COLUMN research_kind TEXT NOT NULL DEFAULT 'committee'
  CHECK (research_kind IN ('committee', 'department'));

ALTER TABLE research_requests
  ADD COLUMN department_id TEXT
  CHECK (department_id IN ('market', 'company', 'financial', 'risk'));

CREATE INDEX research_requests_comparable_reports_idx
  ON research_requests(
    principal_id,
    symbol,
    research_kind,
    department_id,
    created_at DESC
  );
