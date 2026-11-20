CREATE TABLE IF NOT EXISTS activity (
  day_ist TEXT NOT NULL,
  activity TEXT NOT NULL CHECK (activity IN ('Page view','Service opened')),
  page TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day_ist, activity, page)
);

CREATE TABLE IF NOT EXISTS enquiries (
  reference TEXT PRIMARY KEY,
  received_ist TEXT NOT NULL,
  service TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS enquiries_by_date ON enquiries (received_ist DESC);
