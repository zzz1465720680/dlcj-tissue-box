CREATE TABLE IF NOT EXISTS store_users (
 id TEXT PRIMARY KEY, phone TEXT NOT NULL UNIQUE CHECK(phone GLOB '+86[1][3-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
 role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')), invite_code TEXT NOT NULL UNIQUE,
 referred_by TEXT REFERENCES store_users(id), created_at TEXT NOT NULL, verified_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS store_designs (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES store_users(id), latest_version INTEGER NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT
);
CREATE INDEX IF NOT EXISTS store_design_owner ON store_designs(user_id, updated_at);
CREATE TABLE IF NOT EXISTS store_design_versions (
 design_id TEXT NOT NULL REFERENCES store_designs(id), version INTEGER NOT NULL, content_json TEXT NOT NULL,
 fingerprint TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(design_id,version)
);
CREATE TRIGGER IF NOT EXISTS store_design_versions_immutable_update BEFORE UPDATE ON store_design_versions BEGIN SELECT RAISE(ABORT,'immutable design version'); END;
CREATE TRIGGER IF NOT EXISTS store_design_versions_immutable_delete BEFORE DELETE ON store_design_versions BEGIN SELECT RAISE(ABORT,'immutable design version'); END;
CREATE TABLE IF NOT EXISTS store_gallery (
 design_id TEXT NOT NULL, version INTEGER NOT NULL, consent INTEGER NOT NULL DEFAULT 0 CHECK(consent IN (0,1)),
 consent_at TEXT, published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)), published_at TEXT, curated_by TEXT REFERENCES store_users(id),
 PRIMARY KEY(design_id,version), FOREIGN KEY(design_id,version) REFERENCES store_design_versions(design_id,version), CHECK(published=0 OR consent=1)
);
CREATE TABLE IF NOT EXISTS store_referral_rewards (
 id TEXT PRIMARY KEY, inviter_id TEXT NOT NULL REFERENCES store_users(id), friend_id TEXT NOT NULL UNIQUE REFERENCES store_users(id),
 design_id TEXT NOT NULL, design_version INTEGER NOT NULL, fingerprint TEXT NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(design_id,design_version) REFERENCES store_design_versions(design_id,version), CHECK(inviter_id<>friend_id)
);
CREATE INDEX IF NOT EXISTS store_reward_fingerprint ON store_referral_rewards(fingerprint);
CREATE TABLE IF NOT EXISTS store_coupons (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES store_users(id), amount_fen INTEGER NOT NULL CHECK(amount_fen>0),
 available_fen INTEGER NOT NULL CHECK(available_fen>=0), reserved_fen INTEGER NOT NULL DEFAULT 0 CHECK(reserved_fen>=0),
 redeemed_fen INTEGER NOT NULL DEFAULT 0 CHECK(redeemed_fen>=0), expires_at TEXT NOT NULL, created_at TEXT NOT NULL,
 source TEXT NOT NULL, source_ref TEXT, revoked_at TEXT, CHECK(available_fen+reserved_fen+redeemed_fen=amount_fen)
);
CREATE INDEX IF NOT EXISTS store_coupon_owner_expiry ON store_coupons(user_id,expires_at);
CREATE TABLE IF NOT EXISTS store_orders (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES store_users(id), kind TEXT NOT NULL CHECK(kind IN ('standard','custom','bespoke')),
 product TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 100), design_id TEXT, design_version INTEGER,
 snapshot_json TEXT NOT NULL, checkout_json TEXT NOT NULL, status TEXT NOT NULL, unit_price_fen INTEGER, goods_total_fen INTEGER,
 discount_fen INTEGER NOT NULL DEFAULT 0 CHECK(discount_fen BETWEEN 0 AND 3000), shipping_fen INTEGER,
 shipping_state TEXT NOT NULL DEFAULT 'manual_quote_required', shipping_version INTEGER NOT NULL DEFAULT 0, accepted_shipping_version INTEGER,
 quote_version INTEGER NOT NULL DEFAULT 0, accepted_quote_version INTEGER, material_version INTEGER NOT NULL DEFAULT 0, accepted_material_version INTEGER,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, paid_at TEXT, payment_reference TEXT UNIQUE, payment_amount_fen INTEGER,
 goods_refunded_fen INTEGER NOT NULL DEFAULT 0, shipping_refunded_fen INTEGER NOT NULL DEFAULT 0, coupon_returned_fen INTEGER NOT NULL DEFAULT 0,
 material_accepted_at TEXT, production_started_at TEXT, production_earliest_at TEXT, production_latest_at TEXT,
 carrier TEXT, tracking TEXT, dispatched_at TEXT,
 FOREIGN KEY(design_id,design_version) REFERENCES store_design_versions(design_id,version),
 CHECK(goods_total_fen IS NULL OR (goods_total_fen>=discount_fen AND goods_refunded_fen<=goods_total_fen)),
 CHECK(shipping_fen IS NULL OR (shipping_fen>=0 AND shipping_refunded_fen<=shipping_fen))
);
CREATE INDEX IF NOT EXISTS store_order_owner ON store_orders(user_id,created_at);
CREATE TRIGGER IF NOT EXISTS store_order_snapshot_immutable BEFORE UPDATE OF snapshot_json,design_id,design_version,user_id,kind,quantity,product ON store_orders BEGIN SELECT RAISE(ABORT,'immutable order snapshot'); END;
CREATE TABLE IF NOT EXISTS store_coupon_allocations (
 order_id TEXT NOT NULL REFERENCES store_orders(id), coupon_id TEXT NOT NULL REFERENCES store_coupons(id), amount_fen INTEGER NOT NULL CHECK(amount_fen>0),
 state TEXT NOT NULL CHECK(state IN ('reserved','redeemed','released')), returned_fen INTEGER NOT NULL DEFAULT 0 CHECK(returned_fen>=0 AND returned_fen<=amount_fen),
 PRIMARY KEY(order_id,coupon_id)
);
CREATE TABLE IF NOT EXISTS store_coupon_ledger (
 id TEXT PRIMARY KEY, coupon_id TEXT NOT NULL REFERENCES store_coupons(id), order_id TEXT REFERENCES store_orders(id),
 action TEXT NOT NULL, amount_fen INTEGER NOT NULL, operation_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS store_material_confirmations (
 order_id TEXT NOT NULL REFERENCES store_orders(id), version INTEGER NOT NULL, note TEXT NOT NULL, photo_refs_json TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES store_users(id), created_at TEXT NOT NULL, PRIMARY KEY(order_id,version)
);
CREATE TRIGGER IF NOT EXISTS store_material_immutable BEFORE UPDATE ON store_material_confirmations BEGIN SELECT RAISE(ABORT,'immutable material confirmation'); END;
CREATE TABLE IF NOT EXISTS store_operations (
 actor_id TEXT NOT NULL, operation_key TEXT NOT NULL, action TEXT NOT NULL, request_hash TEXT NOT NULL, response_json TEXT NOT NULL,
 created_at TEXT NOT NULL, PRIMARY KEY(actor_id,operation_key)
);
CREATE TABLE IF NOT EXISTS store_provider_events (
 event_id TEXT PRIMARY KEY, type TEXT NOT NULL, request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS store_outbox (
 id TEXT PRIMARY KEY, event_key TEXT NOT NULL UNIQUE, recipient TEXT NOT NULL, payload_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent')), attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TEXT NOT NULL, last_error TEXT, created_at TEXT NOT NULL, sent_at TEXT
);
CREATE TABLE IF NOT EXISTS store_audit (
 id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT NOT NULL, detail_json TEXT NOT NULL, created_at TEXT NOT NULL
);
