// ============================================================
//  REST API 路由
//   GET    /api/vendors              列出全部廠商
//   POST   /api/vendors              新增廠商
//   PATCH  /api/vendors/:id          更新廠商
//   DELETE /api/vendors/:id          刪除廠商 (含底下料號)
//
//   GET    /api/parts?vendor=&q=&category=    搜尋料號
//   POST   /api/parts                建立單筆料號
//   PATCH  /api/parts/:id            更新
//   DELETE /api/parts/:id            刪除
//
//   POST   /api/import/preview       上傳 Excel 取得預覽 (尚未寫入)
//   POST   /api/import/commit        將預覽結果寫入 DB
//   POST   /api/import/new-vendor    上傳 Excel + 新增廠商 一次完成
// ============================================================

const express = require('express');
const multer = require('multer');
const db = require('./db');
const { parseExcel } = require('./excel');
const { classify } = require('./classifier');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// ---- Vendors ------------------------------------------------------------
router.get('/vendors', (_req, res) => {
  const list = db.prepare(`
    SELECT v.*,
      (SELECT COUNT(*) FROM parts p WHERE p.vendor_id=v.id) AS total,
      (SELECT COUNT(*) FROM parts p WHERE p.vendor_id=v.id AND p.category='product') AS product_count,
      (SELECT COUNT(*) FROM parts p WHERE p.vendor_id=v.id AND p.category='license') AS license_count
    FROM vendors v
    ORDER BY v.id ASC
  `).all();
  res.json(list);
});

router.post('/vendors', (req, res) => {
  const { code, name, name_en, color } = req.body || {};
  if (!code || !name) return res.status(400).json({ error: 'code 與 name 為必填' });
  try {
    const info = db.prepare(`INSERT INTO vendors (code,name,name_en,color) VALUES (?,?,?,?)`)
      .run(code.toUpperCase().trim(), name.trim(), (name_en||'').trim(), color || '#3f51b5');
    res.json({ id: Number(info.lastInsertRowid) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// node:sqlite 不接受 undefined，將 undefined 轉為 null
const N = (v) => (v === undefined ? null : v);

router.patch('/vendors/:id', (req, res) => {
  const { name, name_en, color } = req.body || {};
  db.prepare(`UPDATE vendors SET name=COALESCE(?,name), name_en=COALESCE(?,name_en), color=COALESCE(?,color) WHERE id=?`)
    .run(N(name), N(name_en), N(color), req.params.id);
  res.json({ ok: true });
});

router.delete('/vendors/:id', (req, res) => {
  db.prepare(`DELETE FROM vendors WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// ---- Parts --------------------------------------------------------------
router.get('/parts', (req, res) => {
  const { vendor, q, category, limit = 500 } = req.query;
  const where = [];
  const args = [];
  if (vendor) { where.push('p.vendor_id=?'); args.push(vendor); }
  if (category && (category === 'product' || category === 'license')) {
    where.push('p.category=?'); args.push(category);
  }
  if (q) {
    where.push('(p.sku LIKE ? OR p.description LIKE ?)');
    args.push(`%${q}%`, `%${q}%`);
  }
  const sql = `
    SELECT p.*, v.code AS vendor_code, v.name AS vendor_name, v.color AS vendor_color
    FROM parts p
    JOIN vendors v ON v.id = p.vendor_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY p.updated_at DESC
    LIMIT ?
  `;
  args.push(Number(limit));
  res.json(db.prepare(sql).all(...args));
});

router.post('/parts', (req, res) => {
  const { vendor_id, sku, description, category } = req.body || {};
  if (!vendor_id || !sku) return res.status(400).json({ error: 'vendor_id 與 sku 為必填' });
  const cat = category || classify(sku, description);
  try {
    const info = db.prepare(`
      INSERT INTO parts (vendor_id, sku, description, category) VALUES (?,?,?,?)
    `).run(vendor_id, sku.trim(), description || '', cat);
    res.json({ id: Number(info.lastInsertRowid) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.patch('/parts/:id', (req, res) => {
  const { sku, description, category } = req.body || {};
  db.prepare(`
    UPDATE parts SET
      sku = COALESCE(?, sku),
      description = COALESCE(?, description),
      category = COALESCE(?, category),
      updated_at = CURRENT_TIMESTAMP
    WHERE id=?
  `).run(N(sku), N(description), N(category), req.params.id);
  res.json({ ok: true });
});

router.delete('/parts/:id', (req, res) => {
  db.prepare(`DELETE FROM parts WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// ---- Excel Import -------------------------------------------------------
router.post('/import/preview', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '請上傳 Excel 檔' });
  const result = parseExcel(req.file.buffer, req.file.originalname);
  // 統計
  const summary = {
    file: req.file.originalname,
    sheets: result.sheets,
    total: result.parts.length,
    product: result.parts.filter(p => p.category === 'product').length,
    license: result.parts.filter(p => p.category === 'license').length,
    parts: result.parts
  };
  res.json(summary);
});

router.post('/import/commit', (req, res) => {
  const { vendor_id, parts } = req.body || {};
  if (!vendor_id || !Array.isArray(parts)) {
    return res.status(400).json({ error: 'vendor_id 與 parts[] 為必填' });
  }
  const stmt = db.prepare(`
    INSERT INTO parts (vendor_id, sku, description, category, source_file)
    VALUES (?,?,?,?,?)
    ON CONFLICT(vendor_id, sku) DO UPDATE SET
      description = excluded.description,
      category    = excluded.category,
      source_file = excluded.source_file,
      updated_at  = CURRENT_TIMESTAMP
  `);
  const insertMany = db.transaction((rows) => {
    let ok = 0;
    for (const p of rows) {
      if (!p.sku) continue;
      stmt.run(vendor_id, String(p.sku).trim(), p.description || '',
        (p.category === 'license' ? 'license' : 'product'),
        p.source_file || '');
      ok++;
    }
    return ok;
  });
  const inserted = insertMany(parts);
  res.json({ ok: true, inserted });
});

// 一次完成: 新廠商 + 上傳 Excel
router.post('/import/new-vendor', upload.single('file'), (req, res) => {
  const { code, name, name_en, color } = req.body || {};
  if (!code || !name || !req.file) {
    return res.status(400).json({ error: 'code、name、Excel 檔皆為必填' });
  }
  let vendorId;
  try {
    const info = db.prepare(`INSERT INTO vendors (code,name,name_en,color) VALUES (?,?,?,?)`)
      .run(code.toUpperCase().trim(), name.trim(), (name_en||'').trim(), color || '#3f51b5');
    vendorId = Number(info.lastInsertRowid);
  } catch (e) {
    return res.status(400).json({ error: '新增廠商失敗: ' + e.message });
  }
  const result = parseExcel(req.file.buffer, req.file.originalname);
  const stmt = db.prepare(`
    INSERT INTO parts (vendor_id, sku, description, category, source_file)
    VALUES (?,?,?,?,?)
    ON CONFLICT(vendor_id, sku) DO UPDATE SET
      description = excluded.description,
      category    = excluded.category,
      updated_at  = CURRENT_TIMESTAMP
  `);
  const insertMany = db.transaction((rows) => {
    let ok = 0;
    for (const p of rows) {
      if (!p.sku) continue;
      stmt.run(vendorId, p.sku, p.description || '', p.category, p.source_file || '');
      ok++;
    }
    return ok;
  });
  const inserted = insertMany(result.parts);
  res.json({ vendor_id: vendorId, inserted, sheets: result.sheets });
});

// ---- Stats --------------------------------------------------------------
router.get('/stats', (_req, res) => {
  const total = db.prepare(`SELECT COUNT(*) AS c FROM parts`).get().c;
  const product = db.prepare(`SELECT COUNT(*) AS c FROM parts WHERE category='product'`).get().c;
  const license = db.prepare(`SELECT COUNT(*) AS c FROM parts WHERE category='license'`).get().c;
  const vendors = db.prepa