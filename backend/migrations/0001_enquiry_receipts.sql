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
