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

CREATE TABLE IF NOT EXISTS enquiry_mail (
  reference TEXT PRIMARY KEY REFERENCES enquiries(reference),
  reply_to TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  delivered INTEGER NOT NULL DEFAULT 0,
  lease TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS pending_enquiry_mail ON enquiry_mail (delivered, lease_until);

CREATE TABLE IF NOT EXISTS enquiry_receipts (
  reference TEXT PRIMARY KEY REFERENCES enquiries(reference),
  recipient TEXT NOT NULL,
  recipient_key TEXT NOT NULL,
  queued_at INTEGER NOT NULL,
  available_at INTEGER NOT NULL DEFAULT 0,
  lease TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed'))
);
CREATE INDEX IF NOT EXISTS pending_enquiry_receipts ON enquiry_receipts (status, available_at);
CREATE INDEX IF NOT EXISTS enquiry_receipts_by_recipient ON enquiry_receipts (recipient_key, queued_at) WHERE recipient_key <> '';
