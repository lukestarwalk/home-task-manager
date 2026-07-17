-- Schema for the household task rotation app.
-- Apply locally:  npm run db:local
-- Apply to prod:  npm run db:remote

CREATE TABLE IF NOT EXISTS people (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT    NOT NULL,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS vacations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id  INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  start_date TEXT    NOT NULL,  -- YYYY-MM-DD (inclusive)
  end_date   TEXT    NOT NULL   -- YYYY-MM-DD (inclusive)
);

CREATE INDEX IF NOT EXISTS idx_vacations_person ON vacations(person_id);

-- Single-row settings table. anchor_date fixes day 0 of the rotation:
-- on that date the first person (lowest position) is responsible.
CREATE TABLE IF NOT EXISTS settings (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  anchor_date TEXT    NOT NULL
);

INSERT OR IGNORE INTO settings (id, anchor_date) VALUES (1, '2024-01-01');
