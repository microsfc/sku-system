// ============================================================
//  SQLite 連線與資料表初始化  (使用 Node.js 內建 node:sqlite)
//  Schema:
//    vendors  - 廠商/代理產品分類 (PA, Forti, CISCO, HPE, 以及自訂)
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
//   parts.sku 改為 nullable: 部分報價單只給「描述」沒給「料號」
//   為兼容舊資料庫: 若偵測到舊版 sku NOT NULL, 進行 ALTER 重建
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
  sku           TEXT,
  description   TEXT,
  category      TEXT NOT NULL DEFAULT 'product',
  family        TEXT,
  family_locked INTEGER NOT NULL DEFAULT 0,
  source_file   TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
);
`);

// ---- Migration: 若舊版本 parts.sku 為 NOT NULL, 改為可空 ----------------
(function migrateSkuNullable() {
  try {
    const cols = db.prepare("PRAGMA table_info(parts)").all();
    const skuCol = cols.find((c) => c.name === 'sku');
    if (!skuCol) return;
    if (skuCol.notnull === 0) return;  // 已是可空, 不需 migrate
    console.log('[db] migrating parts.sku -> nullable ...');
    db.exec(`
      BEGIN;
      CREATE TABLE parts_new (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        vendor_id     INTEGER NOT NULL,
        sku           TEXT,
        description   TEXT,
        category      TEXT NOT NULL DEFAULT 'product',
        source_file   TEXT,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
      );
      INSERT INTO parts_new (id, vendor_id, sku, description, category, source_file, created_at, updated_at)
        SELECT id, vendor_id, sku, description, category, source_file, created_at, updated_at FROM parts;
      DROP TABLE parts;
      ALTER TABLE parts_new RENAME TO parts;
      COMMIT;
    `);
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    console.error('[db] migration failed:', e.message);
  }
})();

// ---- Migration: 既有 DB 加上 family / family_locked 欄位 ----------------
(function migrateAddFamilyColumns() {
  try {
    const cols = db.prepare("PRAGMA table_info(parts)").all();
    const hasFamily = cols.some((c) => c.name === 'family');
    const hasLocked = cols.some((c) => c.name === 'family_locked');
    if (!hasFamily) {
      console.log('[db] adding parts.family column ...');
      db.exec(`ALTER TABLE parts ADD COLUMN family TEXT`);
    }
    if (!hasLocked) {
      console.log('[db] adding parts.family_locked column ...');
      db.exec(`ALTER TABLE parts ADD COLUMN family_locked INTEGER NOT NULL DEFAULT 0`);
    }
  } catch (e) {
    console.error('[db] family-column migration failed:', e.message);
  }
})();

// ---- Indexes ----------------------------------------------------------
db.exec(`
CREATE INDEX IF NOT EXISTS idx_parts_sku    ON parts(sku);
CREATE INDEX IF NOT EXISTS idx_parts_desc   ON parts(description);
CREATE INDEX IF NOT EXISTS idx_parts_vendor ON parts(vendor_id);
CREATE INDEX IF NOT EXISTS idx_parts_family ON parts(family);

-- 部分唯一索引: 只在 SKU 非空時強制 (vendor_id, sku) 唯一
-- 沒有 SKU 的紀錄允許多筆共存 (例如 Cisco DNA Advantage Y3 沒寫料號)
CREATE UNIQUE INDEX IF NOT EXISTS idx_parts_unique_sku
  ON parts(vendor_id, sku) WHERE sku IS NOT NULL AND sku <> '';
`);

// ---- Seed 預設廠商 ------------------------------------------------------
const seed = db.prepare(
  'INSERT OR IGNORE INTO vendors (code, name, name_en, color) VALUES (?,?,?,?)'
);
seed.run('PA',    'Palo Alto 防火牆', 'Palo Alto Networks',           '#FA582D');
seed.run('FORTI', 'Fortinet 產品',    'Fortinet',                     '#EE3124');
seed.run('CISCO', 'Cisco 產品',       'Cisco Systems',                '#1BA0D7');
seed.run('HPE',   'HPE 伺服器',        'Hewlett Packard Enterprise',   '#01A982');

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
