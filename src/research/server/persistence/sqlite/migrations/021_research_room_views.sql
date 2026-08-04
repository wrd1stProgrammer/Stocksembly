CREATE TABLE research_room_views (
  report_id TEXT PRIMARY KEY REFERENCES reports(report_id) ON DELETE CASCADE,
  view_count INTEGER NOT NULL CHECK (view_count >= 0),
  last_viewed_at TEXT NOT NULL
) STRICT;

CREATE INDEX research_room_views_popular_idx
  ON research_room_views(view_count DESC, last_viewed_at DESC);
