ALTER TABLE store_outbox ADD COLUMN delivery_token TEXT;
ALTER TABLE store_outbox ADD COLUMN delivery_claimed_at TEXT;
ALTER TABLE store_outbox ADD COLUMN delivery_requires_review INTEGER NOT NULL DEFAULT 0 CHECK(delivery_requires_review IN (0,1));
