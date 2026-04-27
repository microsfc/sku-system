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
//   POST   /api/import/commit        將預覽結果寫入 DB (指定單一廠商)
//   POST   /api/import/new-vendor    上傳 Excel + 新增廠商 一次完成
//   POST   /api/import/preview-auto  自動辨識廠商, 回傳分組預覽
//   POST   /api/import/commit-auto   依分組寫入, 未存在的廠商自動建立
//
//   GET    /api/stats                整體統計
// ============================================================

const express = require('express');
const multer = require('multer');
const db = require('./db');
const XLSX = require('xlsx');
const { parseExcel } = require('./excel');
const { classify, extractFamily } = require('./classifier');
const { detectVendor } = require('./vendor_detector');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// node:sqlite 不接受 undefined，將 undefined 轉為 null
const N = (v) => (v === undefined ? null : v);

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
function buildPartsQuery(req) {
  const { vendor, q, category, family } = req.query;
  const where = [];
  const args = [];
  if (vendor) { where.push('p.vendor_id=?'); args.push(vendor); }
  if (category && (category === 'product' || category === 'license')) {
    where.push('p.category=?'); args.push(category);
  }
  if (q) {
    where.push('(COALESCE(p.sku, \'\') LIKE ? OR p.description LIKE ? OR COALESCE(p.family, \'\') LIKE ?)');
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (family) {
    where.push('p.family=?'); args.push(family);
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  return { whereSql, args };
}

router.get('/parts', (req, res) => {
  const { limit = 500 } = req.query;
  const { whereSql, args } = buildPartsQuery(req);
  const sql = `
    SELECT p.*, v.code AS vendor_code, v.name AS vendor_name, v.color AS vendor_color
    FROM parts p
    JOIN vendors v ON v.id = p.vendor_id
    ${whereSql}
    ORDER BY p.updated_at DESC
    LIMIT ?
  `;
  res.json(db.prepare(sql).all(...args, Number(limit)));
});

router.post('/parts', (req, res) => {
  const { vendor_id, sku, description, category, family, family_locked } = req.body || {};
  if (!vendor_id) return res.status(400).json({ error: 'vendor_id 為必填' });
  if (!sku && !description) return res.status(400).json({ error: 'sku 或 description 至少需填一項' });
  const cleanSku = sku ? String(sku).trim() : null;
  const cat = category || classify(cleanSku, description);
  const fam = family != null && String(family).trim() !== ''
    ? String(family).trim().toUpperCase()
    : extractFamily(cleanSku, description);
  const locked = family_locked ? 1 : 0;
  try {
    const info = db.prepare(`
      INSERT INTO parts (vendor_id, sku, description, category, family, family_locked)
      VALUES (?,?,?,?,?,?)
    `).run(vendor_id, cleanSku || null, description || '', cat, fam || null, locked);
    res.json({ id: Number(info.lastInsertRowid) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.patch('/parts/:id', (req, res) => {
  const { vendor_id, sku, description, category, family, family_locked } = req.body || {};
  // family 邏輯: 若使用者明確傳入 family (即使空字串), 視為手動設定 → 鎖定
  let famVal = N(undefined);
  let lockedVal = N(undefined);
  if (family !== undefined) {
    const trimmed = family == null ? '' : String(family).trim();
    famVal = trimmed === '' ? null : trimmed.toUpperCase();
    lockedVal = 1;  // 手動設過就鎖
  }
  if (family_locked !== undefined) {
    lockedVal = family_locked ? 1 : 0;
  }

  // vendor_id 變更: 必須先驗證該 vendor 存在 + (vendor_id, sku) 不會撞 UNIQUE
  let vendorVal = N(undefined);
  if (vendor_id !== undefined && vendor_id !== null && vendor_id !== '') {
    const v = Number(vendor_id);
    if (!Number.isFinite(v) || v <= 0) {
      return res.status(400).json({ error: 'vendor_id 不合法' });
    }
    const exists = db.prepare(`SELECT id FROM vendors WHERE id=?`).get(v);
    if (!exists) return res.status(400).json({ error: '指定的廠商不存在' });

    // 檢查目標 vendor 是否已有相同 SKU (避免 UNIQUE 衝突)
    const cur = db.prepare(`SELECT sku FROM parts WHERE id=?`).get(req.params.id);
    const newSku = sku !== undefined && sku !== null && String(sku).trim() !== ''
      ? String(sku).trim()
      : (cur ? cur.sku : null);
    if (newSku) {
      const dup = db.prepare(`
        SELECT id FROM parts WHERE vendor_id=? AND sku=? AND id<>?
      `).get(v, newSku, req.params.id);
      if (dup) {
        return res.status(409).json({
          error: `目標廠商已存在相同料號 ${newSku} (id=${dup.id})`
        });
      }
    }
    vendorVal = v;
  }

  try {
    db.prepare(`
      UPDATE parts SET
        vendor_id = COALESCE(?, vendor_id),
        sku = COALESCE(?, sku),
        description = COALESCE(?, description),
        category = COALESCE(?, category),
        family = CASE WHEN ? = 1 THEN ? ELSE family END,
        family_locked = COALESCE(?, family_locked),
        updated_at = CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      vendorVal,
      N(sku), N(description), N(category),
      family !== undefined ? 1 : 0, famVal,
      lockedVal,
      req.params.id
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/parts/:id', (req, res) => {
  db.prepare(`DELETE FROM parts WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// 批次刪除: body { ids: number[] }
router.post('/parts/bulk-delete', (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids[] 為必填' });
  }
  const cleanIds = ids.map(Number).filter(n => Number.isFinite(n) && n > 0);
  if (cleanIds.length === 0) return res.status(400).json({ error: 'ids[] 為空' });
  const placeholders = cleanIds.map(() => '?').join(',');
  const info = db.prepare(`DELETE FROM parts WHERE id IN (${placeholders})`).run(...cleanIds);
  res.json({ ok: true, deleted: Number(info.changes) });
});

// ---- Import helpers -----------------------------------------------------
// 有 SKU → UPSERT (family_locked=1 不覆寫 family); 沒 SKU → 直接 INSERT
const upsertWithSku = db.prepare(`
  INSERT INTO parts (vendor_id, sku, description, category, family, source_file)
  VALUES (?,?,?,?,?,?)
  ON CONFLICT(vendor_id, sku) WHERE sku IS NOT NULL AND sku <> '' DO UPDATE SET
    description = excluded.description,
    category    = excluded.category,
    family      = CASE WHEN parts.family_locked = 1 THEN parts.family ELSE excluded.family END,
    source_file = excluded.source_file,
    updated_at  = CURRENT_TIMESTAMP
`);
const insertNoSku = db.prepare(`
  INSERT INTO parts (vendor_id, sku, description, category, family, source_file)
  VALUES (?, NULL, ?, ?, ?, ?)
`);

// 同 vendor + 同 description (sku 為 null) 的紀錄已存在 → 略過
const existsNullSku = db.prepare(`
  SELECT id FROM parts
  WHERE vendor_id=? AND sku IS NULL AND COALESCE(description,'')=COALESCE(?, '')
  LIMIT 1
`);

function writePart(vendorId, p) {
  const sku  = (p.sku && String(p.sku).trim()) || null;
  const desc = p.description || '';
  const cat  = (p.category === 'license' ? 'license' : 'product');
  const src  = p.source_file || '';
  const fam  = extractFamily(sku, desc) || null;
  if (sku) {
    upsertWithSku.run(vendorId, sku, desc, cat, fam, src);
  } else {
    if (!desc) return false;
    if (existsNullSku.get(vendorId, desc)) return false;  // 已存在同描述的空 SKU 紀錄
    insertNoSku.run(vendorId, desc, cat, fam, src);
  }
  return true;
}

// ---- Excel Import (legacy: single-vendor) -------------------------------
router.post('/import/preview', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '請上傳 Excel 檔' });
  const result = parseExcel(req.file.buffer, req.file.originalname);
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
  const insertMany = db.transaction((rows) => {
    let ok = 0;
    for (const p of rows) {
      if (writePart(vendor_id, p)) ok++;
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
  const insertMany = db.transaction((rows) => {
    let ok = 0;
    for (const p of rows) {
      if (writePart(vendorId, p)) ok++;
    }
    return ok;
  });
  const inserted = insertMany(result.parts);
  res.json({ vendor_id: vendorId, inserted, sheets: result.sheets });
});

// ---- Auto-detect Import (multi-vendor) ----------------------------------
//   /import/preview-auto: 解析 Excel, 依 SKU/描述自動辨識每筆資料的廠商,
//     回傳分組預覽。已存在的 vendor 標 exists=true; 否則 exists=false 並
//     附上建議的 name/color, 由前端確認後送至 commit-auto.
router.post('/import/preview-auto', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '請上傳 Excel 檔' });

  const parsed = parseExcel(req.file.buffer, req.file.originalname);

  // 列出現有 vendors 以便比對
  const existingByCode = new Map();
  for (const v of db.prepare(`SELECT * FROM vendors`).all()) {
    existingByCode.set(v.code.toUpperCase(), v);
  }

  // 依偵測結果分組
  const groups = new Map();   // key: code (or 'UNKNOWN')
  for (const p of parsed.parts) {
    const det = detectVendor(p.sku, p.description);
    const code = det ? det.code : 'UNKNOWN';
    if (!groups.has(code)) {
      const existing = det ? existingByCode.get(det.code) : null;
      groups.set(code, {
        vendor_code: code,
        vendor_id: existing?.id || null,
        vendor_name:   existing?.name    || det?.name    || '未識別',
        vendor_name_en: existing?.name_en || det?.name_en || '',
        vendor_color:  existing?.color   || det?.color   || '#9E9E9E',
        exists: !!existing,
        will_create: !existing && !!det,
        count: 0,
        product: 0,
        license: 0,
        parts: []
      });
    }
    const g = groups.get(code);
    g.parts.push(p);
    g.count++;
    if (p.category === 'license') g.license++; else g.product++;
  }

  res.json({
    file: req.file.originalname,
    sheets: parsed.sheets,
    total: parsed.parts.length,
    product: parsed.parts.filter(p => p.category === 'product').length,
    license: parsed.parts.filter(p => p.category === 'license').length,
    groups: [...groups.values()]
  });
});

//   /import/commit-auto: 接收前端送回的 groups[], 對每組:
//     - 若 vendor_id 存在 → 寫入該 vendor
//     - 若 will_create=true 且有 vendor_code → 建立新廠商再寫入
//     - 若 vendor_code='UNKNOWN' 但前端指定了 vendor_id (使用者手動選了廠商) → 寫入
//     - 否則該組略過 (回傳 skipped)
router.post('/import/commit-auto', (req, res) => {
  const { groups } = req.body || {};
  if (!Array.isArray(groups)) return res.status(400).json({ error: 'groups[] 為必填' });

  const results = [];
  let totalInserted = 0;

  for (const g of groups) {
    const code = (g.vendor_code || '').toUpperCase();
    let vendorId = g.vendor_id || null;

    // 若前端指定 will_create 且尚無 vendorId, 建立新廠商
    if (!vendorId && g.will_create && code && code !== 'UNKNOWN') {
      try {
        const info = db.prepare(`INSERT INTO vendors (code,name,name_en,color) VALUES (?,?,?,?)`)
          .run(code, g.vendor_name || code, g.vendor_name_en || '', g.vendor_color || '#3f51b5');
        vendorId = Number(info.lastInsertRowid);
      } catch (e) {
        // 可能因 race condition 已存在, 重新查一次
        const exist = db.prepare(`SELECT id FROM vendors WHERE code=?`).get(code);
        if (exist) vendorId = exist.id;
        else {
          results.push({ vendor_code: code, error: e.message, inserted: 0, skipped: (g.parts || []).length });
          continue;
        }
      }
    }

    if (!vendorId) {
      results.push({ vendor_code: code || 'UNKNOWN', skipped: (g.parts || []).length, inserted: 0, reason: '未指定廠商' });
      continue;
    }

    const insertMany = db.transaction((rows) => {
      let ok = 0;
      for (const p of rows) {
        if (writePart(vendorId, p)) ok++;
      }
      return ok;
    });
    const inserted = insertMany(g.parts || []);
    totalInserted += inserted;
    results.push({
      vendor_code: code,
      vendor_id: vendorId,
      vendor_name: g.vendor_name,
      created: !!g.will_create,
      inserted
    });
  }

  res.json({ ok: true, total_inserted: totalInserted, results });
});

// ---- Classification: backfill / families list --------------------------
//   POST /api/classify/backfill
//     body: { force?: boolean }   force=true 連 family_locked=1 也覆寫 (預設 false)
//   會逐筆計算 extractFamily 並寫回 parts.family
router.post('/classify/backfill', (req, res) => {
  const body = req.body || {};
  const force = !!body.force;
  const vendor = body.vendor != null ? Number(body.vendor) : null;

  const where = [];
  const args = [];
  if (!force) where.push('family_locked = 0');
  if (vendor) { where.push('vendor_id = ?'); args.push(vendor); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const rows = db.prepare(
    `SELECT id, sku, description, family FROM parts ${whereSql}`
  ).all(...args);
  const upd = db.prepare(`UPDATE parts SET family=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`);
  let updated = 0, unchanged = 0, cleared = 0;

  const tx = db.transaction((all) => {
    for (const r of all) {
      const fam = extractFamily(r.sku, r.description);
      const newVal = fam || null;
      const oldVal = r.family || null;
      if (newVal === oldVal) { unchanged++; continue; }
      upd.run(newVal, r.id);
      if (newVal === null) cleared++;
      updated++;
    }
  });
  tx(rows);

  // 回傳分組後的 family 數量摘要
  const sumWhere = ['family IS NOT NULL', 'family <> \'\''];
  const sumArgs = [];
  if (vendor) { sumWhere.push('vendor_id = ?'); sumArgs.push(vendor); }
  const summary = db.prepare(`
    SELECT family, COUNT(*) AS count
    FROM parts
    WHERE ${sumWhere.join(' AND ')}
    GROUP BY family
    ORDER BY count DESC, family ASC
  `).all(...sumArgs);

  res.json({
    ok: true,
    scope: vendor ? 'vendor' : 'all',
    vendor_id: vendor || null,
    scanned: rows.length,
    updated,
    unchanged,
    cleared,
    families: summary
  });
});

// 列出所有 family 與其數量 (供前端篩選 / chip 顯示)
router.get('/families', (req, res) => {
  const { vendor } = req.query;
  const where = ['family IS NOT NULL', 'family <> \'\''];
  const args = [];
  if (vendor) { where.push('vendor_id = ?'); args.push(vendor); }
  const sql = `
    SELECT family, COUNT(*) AS count,
      SUM(CASE WHEN category='product' THEN 1 ELSE 0 END) AS product,
      SUM(CASE WHEN category='license' THEN 1 ELSE 0 END) AS license
    FROM parts
    WHERE ${where.join(' AND ')}
    GROUP BY family
    ORDER BY count DESC, family ASC
  `;
  res.json(db.prepare(sql).all(...args));
});

// ---- Excel Export -------------------------------------------------------
//   兩種模式:
//     POST /api/export/selected   body: { ids: number[] }
//     GET  /api/export/filtered   query: vendor / q / category / family   (與 /parts 同篩選)
//   兩者皆回傳 .xlsx (application/vnd.openxmlformats...)
// Excel sheet 名稱不能含某些字元 (\ / ? * [ ] :), 也不能超過 31 字
function sanitizeSheetName(name) {
  let n = String(name || 'Sheet').replace(/[\\/?*\[\]:]/g, '_').trim();
  if (n.length > 31) n = n.slice(0, 31);
  if (!n) n = 'Sheet';
  return n;
}

// 確保 workbook 內 sheet 名不重複
function uniqueSheetName(wb, base) {
  let name = sanitizeSheetName(base);
  if (!wb.SheetNames.includes(name)) return name;
  let i = 2;
  while (true) {
    const candidate = sanitizeSheetName(name.slice(0, 28) + ' ' + i);
    if (!wb.SheetNames.includes(candidate)) return candidate;
    i++;
  }
}

// 把同一廠商的 rows 寫成一個 sheet:
//   - 先依 family 分組 (未分類擺最後)
//   - 每個 family 區塊上方有「▶ FAMILY — N items」橫幅 (跨 7 欄合併)
//   - 同 family 內: product 在前 / license 在後, 各自再依 SKU 排序
//   - family 區塊間插入空白分隔列
//   - 欄位順序: Family / SKU / Description / Category / Family Locked / Source / Updated
function appendVendorSheet(wb, vendorCode, vendorName, rows) {
  // 1. 分組
  const groupMap = new Map();
  for (const r of rows) {
    const key = r.family || '';
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(r);
  }

  // 2. group 排序: 有 family 的依字母, 「未分類」擺最後
  const groups = [...groupMap.entries()].sort((a, b) => {
    if (a[0] === '' && b[0] !== '') return 1;
    if (a[0] !== '' && b[0] === '') return -1;
    return a[0].localeCompare(b[0]);
  });

  // 3. 同一 group 內: product → license, 各自 SKU asc (空 SKU 最後)
  for (const [, items] of groups) {
    items.sort((a, b) => {
      if (a.category !== b.category) return a.category === 'product' ? -1 : 1;
      const sa = String(a.sku || '');
      const sb = String(b.sku || '');
      if (!sa && sb) return 1;
      if (sa && !sb) return -1;
      return sa.localeCompare(sb);
    });
  }

  // 4. 構建 AoA + merges
  const NUM_COLS = 7;
  const aoa = [];
  const merges = [];

  // 4-1. 廠商標題橫幅 (列 0)
  aoa.push([`═══ ${vendorCode} — ${vendorName || ''}  ·  ${rows.length} items ═══`]);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: NUM_COLS - 1 } });
  // 4-2. 空白分隔
  aoa.push([]);
  // 4-3. 欄位標題 (列 2)
  aoa.push(['Family', 'SKU', 'Description', 'Category', 'Family Locked', 'Source', 'Updated']);

  // 4-4. 每組: 空白列 + family banner + 資料列
  let firstGroup = true;
  for (const [family, items] of groups) {
    if (!firstGroup) {
      aoa.push([]);  // 不同 family 之間的空白分隔列
    }
    firstGroup = false;

    const famLabel = family || '(未分類)';
    const productCount = items.filter((r) => r.category === 'product').length;
    const licenseCount = items.length - productCount;
    const bannerRow = aoa.length;
    aoa.push([
      `▶ ${famLabel}   ·   ${items.length} items   ` +
      `(P:${productCount} / L:${licenseCount})`
    ]);
    merges.push({ s: { r: bannerRow, c: 0 }, e: { r: bannerRow, c: NUM_COLS - 1 } });

    for (const r of items) {
      aoa.push([
        family || '(未分類)',
        r.sku || '',
        r.description || '',
        r.category || '',
        r.family_locked ? 'Y' : '',
        r.source_file || '',
        r.updated_at || ''
      ]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;
  // 凍結列 1-3 (廠商橫幅 + 空行 + 欄名)
  ws['!freeze'] = { xSplit: 0, ySplit: 3 };
  // 欄寬
  const widths = [16, 28, 80, 10, 14, 28, 20];
  ws['!cols'] = widths.map((w) => ({ wch: w }));

  const sheetName = uniqueSheetName(wb, vendorCode || vendorName || 'Sheet');
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
}

// 將任意 rows 依 vendor_code 分組, 為每組建立 sheet; 額外加一個 'Summary' sheet
function buildVendorTabbedWorkbook(rows) {
  const wb = XLSX.utils.book_new();
  if (rows.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([['(no data)']]);
    XLSX.utils.book_append_sheet(wb, ws, 'Empty');
    return wb;
  }

  // 分組
  const groups = new Map();   // vendor_code → { name, rows[] }
  for (const r of rows) {
    const code = r.vendor_code || 'UNKNOWN';
    if (!groups.has(code)) groups.set(code, { name: r.vendor_name || code, rows: [] });
    groups.get(code).rows.push(r);
  }

  // Summary sheet 先建 (放最前面)
  const summaryAoa = [
    ['Vendor', 'Vendor Name', 'Total', 'Product', 'License', 'Families'],
  ];
  for (const [code, g] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const product = g.rows.filter(r => r.category === 'product').length;
    const license = g.rows.filter(r => r.category === 'license').length;
    const families = new Set(g.rows.map(r => r.family).filter(Boolean));
    summaryAoa.push([code, g.name, g.rows.length, product, license, families.size]);
  }
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryAoa);
  summaryWs['!cols'] = [12, 28, 8, 10, 10, 10].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  // 每廠商一個 sheet
  for (const [code, g] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    appendVendorSheet(wb, code, g.name, g.rows);
  }
  return wb;
}

function sendXlsx(res, wb, filename) {
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition',
    `attachment; filename="${encodeURIComponent(filename)}"`);
  res.send(buf);
}

router.post('/export/selected', (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids[] 為必填' });
  }
  const cleanIds = ids.map(Number).filter(n => Number.isFinite(n) && n > 0);
  if (cleanIds.length === 0) return res.status(400).json({ error: 'ids[] 為空' });
  const placeholders = cleanIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT p.*, v.code AS vendor_code, v.name AS vendor_name
    FROM parts p
    JOIN vendors v ON v.id = p.vendor_id
    WHERE p.id IN (${placeholders})
    ORDER BY v.code ASC, p.family ASC, p.sku ASC
  `).all(...cleanIds);
  const wb = buildVendorTabbedWorkbook(rows);
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  sendXlsx(res, wb, `parts-selected-${ts}.xlsx`);
});

router.get('/export/filtered', (req, res) => {
  const { whereSql, args } = buildPartsQuery(req);
  const rows = db.prepare(`
    SELECT p.*, v.code AS vendor_code, v.name AS vendor_name
    FROM parts p
    JOIN vendors v ON v.id = p.vendor_id
    ${whereSql}
    ORDER BY v.code ASC, p.family ASC, p.sku ASC
  `).all(...args);
  const wb = buildVendorTabbedWorkbook(rows);
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  sendXlsx(res, wb, `parts-filtered-${ts}.xlsx`);
});

// ---- Stats --------------------------------------------------------------
router.get('/stats', (_req, res) => {
  const total   = db.prepare(`SELECT COUNT(*) AS c FROM parts`).get().c;
  const product = db.prepare(`SELECT COUNT(*) AS c FROM parts WHERE category='product'`).get().c;
  const license = db.prepare(`SELECT COUNT(*) AS c FROM parts WHERE category='license'`).get().c;
  const vendors = db.prepare(`SELECT COUNT(*) AS c FROM vendors`).get().c;
  res.json({ total, product, license, vendors });
});

module.exports = router;
