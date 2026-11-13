CREATE TABLE events (
  id TEXT PRIMARY KEY,
  family TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  icon TEXT NOT NULL,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE INDEX events_family_dates ON events(family, start, end);
