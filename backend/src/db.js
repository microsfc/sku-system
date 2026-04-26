// ============================================================
//  SQLite 連線與資料表初始化  (使用 Node.js 內建 node:sqlite)
//  Schema:
//    vendors  - 廠商/代理產品分類 (PA, Forti, CISCO, 以及自訂)
//    parts    - 料號 (含 SKU、說明、分類: product / license)
//
//  需要 Node.js 22.5+ (Node 22.5/23 為 experimental, Node 24+ 已 stable)
// ============================================================

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'parts.db');
const db = new DatabaseSync(DB_FILE);

// PRAGMA: WAL 模式 + 啟用外鍵
try { db.exec('PRAGMA journal_mode = WAL'); } catch {}
db.exec('PRAGMA foreign_keys = ON');

// ---- Schema ------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS vendors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  name_en     TEXT,
  color       TEXT DEFAULT '#3f51b5',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS parts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id     INTEGER NOT NULL,
  sku           TEXT NOT NULL,
  description   TEXT,
  category      TEXT NOT NULL DEFAULT 'product',
  source_file   TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  UNIQUE (vendor_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_parts_sku    ON parts(sku);
CREATE INDEX IF NOT EXISTS idx_parts_desc   ON parts(description);
CREATE INDEX IF NOT EXISTS idx_parts_vendor ON parts(vendor_id);
`);

// ---- Seed 預設廠商 ------------------------------------------------------
const seed = db.prepare(
  'INSERT OR IGNORE INTO vendors (code, name, name_en, color) VALUES (?,?,?,?)'
);
seed.run('PA',    'Palo Alto 防火牆', 'Palo Alto Networks', '#FA582D');
seed.run('FORTI', 'Fortinet 產品',    'Fortinet',           '#EE3124');
seed.run('CISCO', 'Cisco 產品',       'Cisco Systems',      '#1BA0D7');

// ---- 簡易 transaction helper (取代 better-sqlite3 的 db.transaction) ----
function transaction(fn) {
  return (...args) => {
    db.exec('BEGIN');
    try {
      const r = fn(...args);
      db.exec('COMMIT');
      return r;
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch {}
      throw e;
    }
  };
}
db.transaction = transaction;

module.exports = db;
