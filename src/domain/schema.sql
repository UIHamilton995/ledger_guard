-- LedgerGuard mock ERP schema (SQLite)

CREATE TABLE IF NOT EXISTS items (
  sku           TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  on_hand       INTEGER NOT NULL DEFAULT 0,
  reorder_point INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  po_id            TEXT PRIMARY KEY,
  sku              TEXT NOT NULL REFERENCES items(sku),
  supplier         TEXT NOT NULL,
  qty_ordered      INTEGER NOT NULL CHECK (qty_ordered > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0),
  ordered_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goods_receipts (
  gr_id        TEXT PRIMARY KEY,
  po_id        TEXT NOT NULL REFERENCES purchase_orders(po_id),
  qty_received INTEGER NOT NULL CHECK (qty_received >= 0),
  received_at  TEXT NOT NULL
);

-- memo is free text written by suppliers: untrusted input (prompt-injection surface)
CREATE TABLE IF NOT EXISTS invoices (
  inv_id           TEXT PRIMARY KEY,
  po_id            TEXT NOT NULL REFERENCES purchase_orders(po_id),
  qty_billed       INTEGER NOT NULL CHECK (qty_billed >= 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0),
  memo             TEXT NOT NULL DEFAULT '',
  billed_at        TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'held'))
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sku        TEXT NOT NULL REFERENCES items(sku),
  delta      INTEGER NOT NULL,
  reason     TEXT NOT NULL,
  ref        TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS proposals (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id           TEXT NOT NULL,
  idempotency_key  TEXT NOT NULL UNIQUE,
  type             TEXT NOT NULL,
  payload          TEXT NOT NULL,
  risk             TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',
  decided_by       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     TEXT,
  actor      TEXT NOT NULL,
  action     TEXT NOT NULL,
  input      TEXT,
  output     TEXT,
  status     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_receipts_po  ON goods_receipts(po_id);
CREATE INDEX IF NOT EXISTS idx_invoices_po  ON invoices(po_id);
CREATE INDEX IF NOT EXISTS idx_moves_sku    ON stock_movements(sku);
CREATE INDEX IF NOT EXISTS idx_audit_run    ON audit_log(run_id);
