CREATE TABLE store_pricing (
 id INTEGER PRIMARY KEY CHECK(id=1),
 version INTEGER NOT NULL CHECK(typeof(version)='integer' AND version>=1),
 standard_fen INTEGER NOT NULL CHECK(typeof(standard_fen)='integer' AND standard_fen BETWEEN 1 AND 1000000),
 custom_fen INTEGER NOT NULL CHECK(typeof(custom_fen)='integer' AND custom_fen BETWEEN 1 AND 1000000),
 updated_at TEXT NOT NULL,
 updated_by TEXT REFERENCES store_users(id)
);
ALTER TABLE store_orders ADD COLUMN pricing_version INTEGER;
-- Existing fixed-price order amounts remain their immutable purchase snapshot.
CREATE TRIGGER store_fixed_price_immutable BEFORE UPDATE OF unit_price_fen,goods_total_fen,pricing_version ON store_orders
WHEN OLD.kind!='bespoke' AND (OLD.unit_price_fen IS NOT NEW.unit_price_fen OR OLD.goods_total_fen IS NOT NEW.goods_total_fen OR OLD.pricing_version IS NOT NEW.pricing_version)
BEGIN SELECT RAISE(ABORT,'immutable order price'); END;
