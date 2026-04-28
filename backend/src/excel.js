// ============================================================
//  Excel 智慧解析器 (Smart Parser)
//
//  支援:
//   - 簡單格式 (第一列為標題, 後續為資料)
//   - 複雜格式 (報價單常見):
//       * 多列合併標題 (例如 Selling Price 跨欄)
//       * 同一份 Sheet 有多個區塊 (左半邊+右半邊各一組標題)
//       * 區塊式報價單 (HPE: Server A / Server B 各自有一組 header)
//       * 標題列前有空白列、Logo、報價單編號等元資料
//       * 區段分組標題 (如 "Product : PA-550 1 unit 1 YR")
//       * 「Description」有 header 但「料號」欄無 header (TECHONE 報價單) → 推論左側為 SKU 欄
//       * 主項目有料號、子項目只有 description → 從 description 開頭抽 SKU
//   - 中英欄位名稱: 料號 / Part Number / Product Number / Item Name / SKU /
//                  Model / 型號 / P/N / PN
//                  說明 / Description / Desc / 規格 / 名稱 / Product Name / 品名
// ============================================================

const XLSX = require('xlsx');
const { classify } = require('./classifier');

const SKU_HEADERS = [
  '料號', 'SKU', 'PART NUMBER', 'PART NO', 'PART NO.', 'PARTNUMBER',
  'PART#', 'PART #', 'MODEL', '型號', 'P/N', 'PN', 'ITEM', 'ITEM CODE',
  'PRODUCT NUMBER', 'ITEM NAME', 'ITEM NO.', 'ITEM NO',
  'PRODUCT CODE', 'PRODUCT NO', 'PRODUCT NO.'
];
const DESC_HEADERS = [
  '說明', '描述', 'DESCRIPTION', 'DESC', '規格', '名稱',
  'PRODUCT NAME', 'NAME', '品名', 'PRODUCT', 'ITEM DESCRIPTION'
];

// 「報價單群組標題 / 彙總列」會在 SKU 欄出現的雜訊
//   - "Option 1" / "Option A"        — 報價分組標題
//   - "Product"                      — 標題誤入
//   - "Total Products" / "Subtotal"  — 彙總列
//   - "Product : PA-550 1 unit 1 YR" — Palo Alto 報價分組標題
function isNoiseSkuCell(v) {
  if (!v) return false;
  const s = String(v).trim();
  if (!s) return false;
  const u = s.toUpperCase();
  if (/^OPTION\s*[0-9A-Z]{1,3}$/i.test(s)) return true;
  if (/^TOTAL\s*PRODUCTS?$/i.test(s)) return true;
  if (/^GRAND\s*TOTAL/i.test(s)) return true;
  if (/^SUB\s*-?\s*TOTAL/i.test(s)) return true;
  if (/^PRODUCT\s*:/i.test(s)) return true;        // "Product : PA-550 ..."
  if (/^SECTION\s*[0-9A-Z]{1,3}$/i.test(s)) return true;
  if (/^GROUP\s*[0-9A-Z]{1,3}$/i.test(s)) return true;
  if (/^(QUOTE|QUOTATION|REMARK|REMARKS|NOTE|NOTES?)$/i.test(u)) return true;
  return false;
}

// 一般「看起來像料號」 (用於沒有 header 的全 sheet 掃描)
//   - 至少一個英文字母
//   - 含 hyphen 或 / 或數字 (純文字描述會被排除)
//   - 長度 3 ~ 60
function looksLikeSku(v) {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  if (s.length < 3 || s.length > 60) return false;
  if (!/[A-Za-z]/.test(s)) return false;       // 必須含字母
  if (!/[-_/\d]/.test(s)) return false;         // 必須含 hyphen 或 / 或數字
  if (/\s{2,}/.test(s)) return false;           // 不應含連續空白
  if (/^(product|description|qty|unit|total|price|item|no\.?|#|option|section|group)$/i.test(s)) return false;
  if (isNoiseSkuCell(s)) return false;          // 群組標題、彙總列
  return true;
}

// 嚴格版「看起來像料號」 (用於 SKU 欄推論 / 描述前綴抽取)
//   - 不含任何空白
//   - 含 hyphen / 底線 / 斜線, 或者長度 >= 5 且同時含字母與數字
function looksLikeSkuStrict(v) {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  if (s.length < 4 || s.length > 40) return false;
  if (/\s/.test(s)) return false;
  if (!/[A-Za-z]/.test(s)) return false;
  const hasSep = /[-_/]/.test(s);
  const hasDigit = /\d/.test(s);
  if (!hasSep && !(hasDigit && s.length >= 5)) return false;
  if (/^(product|description|qty|unit|total|price|item|no\.?|#)$/i.test(s)) return false;
  return true;
}

// 從描述開頭嘗試抽出 SKU
//   - 取首個 token (至空白為止)
//   - 必須含 hyphen 且長度 5-40
//   - 例: "SNTC-8X5XNBD Catalyst 9300X..."  → "SNTC-8X5XNBD"
//   - 例: "FortiGate-200G (24*7) Box Bundle..." → "FortiGate-200G"
//   - 例: "Cisco DNA Advantage 3 Year License" → ''
//   - 例: "C9300 DNA Essentials..."           → ''   (C9300 沒 hyphen)
function extractSkuFromDescPrefix(desc) {
  if (!desc) return '';
  const trimmed = String(desc).trim();
  // 取首個 token: 字母/數字/_/-/. 開頭, 至空白前
  const m = trimmed.match(/^([A-Za-z0-9][A-Za-z0-9_./-]{3,39})(?=\s|$|[(,])/);
  if (!m) return '';
  const candidate = m[1].replace(/[.,]+$/, '');  // 去尾的標點
  if (candidate.length < 5) return '';
  if (!/-/.test(candidate)) return '';            // 必須含 hyphen
  if (!/[A-Za-z]/.test(candidate)) return '';
  return candidate;
}

function norm(v) { return String(v ?? '').replace(/\s+/g, ' ').trim(); }
function up(v)   { return norm(v).toUpperCase(); }

// 在某一列中找出所有「SKU 欄」與「描述欄」的欄索引
//   回傳 [{ skuCol, descCol }, ...]，可能多組 (左右多區塊)
function detectSectionsInRow(row) {
  const skuCols = [];
  const descCols = [];
  for (let c = 0; c < row.length; c++) {
    const cell = up(row[c]);
    if (!cell) continue;
    if (SKU_HEADERS.includes(cell))  skuCols.push(c);
    if (DESC_HEADERS.includes(cell)) descCols.push(c);
  }
  // 配對: 每個 sku 欄找最近 (向右優先) 的 desc 欄
  const sections = skuCols.map(skuCol => {
    let best = -1, bestDist = Infinity;
    for (const dc of descCols) {
      const dist = Math.abs(dc - skuCol);
      const adj = dc > skuCol ? dist : dist + 0.5;
      if (adj < bestDist) { bestDist = adj; best = dc; }
    }
    return { skuCol, descCol: best };
  });
  return { sections, skuCols, descCols };
}

// 推論「沒有 SKU header 但有 Description header」時的 SKU 欄
//   - 嘗試 descCol-1, descCol-2 (向左尋找)
//   - 該欄在隨後資料列中, 至少 25% 看起來是 SKU 才接受
function inferSkuColFromDescCol(rows, headerRow, descCol, lookDistance = 60) {
  const startR = headerRow + 1;
  const endR = Math.min(rows.length, startR + lookDistance);
  const candidates = [descCol - 1, descCol - 2].filter(c => c >= 0);

  let bestCol = -1, bestScore = 0;
  for (const c of candidates) {
    let skuCount = 0, populated = 0;
    for (let r = startR; r < endR; r++) {
      const row = rows[r] || [];
      const cell = norm(row[c]);
      if (!cell) continue;
      populated++;
      if (looksLikeSkuStrict(cell)) skuCount++;
    }
    // 至少 3 筆有值, 其中至少 25% 像 SKU
    if (populated >= 3 && skuCount * 4 >= populated) {
      if (skuCount > bestScore) { bestScore = skuCount; bestCol = c; }
    }
  }
  return bestCol;
}

// 在 sheet 中掃描所有 (header row, [{skuCol, descCol}]) 區塊
// 不限制 scanLimit (報價單可能有多區塊散落各處)
function findAllSections(rows) {
  const found = [];

  // Pass 1: 找有 SKU+DESC header 的標準區塊
  for (let r = 0; r < rows.length; r++) {
    const { sections } = detectSectionsInRow(rows[r] || []);
    if (sections.length > 0) found.push({ headerRow: r, sections });
  }
  if (found.length > 0) return found;

  // Pass 2 fallback: 只找到 DESC header 的列, 推論 SKU 欄
  for (let r = 0; r < rows.length; r++) {
    const { skuCols, descCols } = detectSectionsInRow(rows[r] || []);
    if (skuCols.length === 0 && descCols.length > 0) {
      const sections = [];
      for (const dc of descCols) {
        const inferredSku = inferSkuColFromDescCol(rows, r, dc);
        if (inferredSku >= 0) {
          sections.push({ skuCol: inferredSku, descCol: dc });
        }
      }
      if (sections.length > 0) found.push({ headerRow: r, sections });
    }
  }
  return found;
}

// 是否為「無意義」描述, 過濾掉合計/小計/備註等列
function isBoilerplate(s) {
  if (!s) return true;
  const u = up(s);
  return (
    u.length < 3 ||
    /^(TOTAL|GRAND\s*TOTAL|SUBTOTAL|SUB-?TOTAL|TOTAL\s*PRODUCTS?|小計|合計|總計|備註|REMARK|REMARKS|NOTE|NOTES?:?)$/.test(u) ||
    /^OPTION\s*[0-9A-Z]{1,3}$/.test(u) ||
    /^SECTION\s*[0-9A-Z]{1,3}$/.test(u) ||
    /^GROUP\s*[0-9A-Z]{1,3}$/.test(u)
  );
}

// 「群組標題列」: 諸如 "Product : PA-550 1 unit 1 YR" / "Section A: Hardware"
//    出現在報價單分組欄位，會被誤判為料號或描述
function isGroupHeader(desc) {
  if (!desc) return false;
  const s = String(desc).trim();
  if (!s) return false;
  // "Product : PA-550 1 unit 1 YR" / "Product: FW 3-year"
  if (/^PRODUCT\s*:/i.test(s)) return true;
  // "Section A: Hardware" / "Group 1 - Licenses"
  if (/^(SECTION|GROUP|CATEGORY)\s*[0-9A-Z]{1,3}\s*[:\-]/i.test(s)) return true;
  // "Option 1: …"
  if (/^OPTION\s*[0-9A-Z]{1,3}\s*[:\-]/i.test(s)) return true;
  // 純粹 "Option 1" / "Option A" (描述欄空蕩蕩只剩這一句, 視為標題)
  if (/^OPTION\s*[0-9A-Z]{1,3}$/i.test(s)) return true;
  return false;
}

function parseSheet(sheetName, sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const found = findAllSections(rows);
  const parts = [];

  if (found.length === 0) {
    // 找不到 header → 退而求其次: 全 sheet 掃描看起來像料號的儲存格
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] || [];
      for (let c = 0; c < row.length; c++) {
        if (looksLikeSku(row[c])) {
          let desc = '';
          for (let dc = c + 1; dc < Math.min(row.length, c + 5); dc++) {
            const v = norm(row[dc]);
            if (v && !looksLikeSku(v)) { desc = v; break; }
          }
          parts.push({
            sku: norm(row[c]),
            description: desc,
            category: classify(row[c], desc),
            source_file: '',
            sheet: sheetName
          });
        }
      }
    }
    return { name: sheetName, parts: dedupParts(parts) };
  }

  // 對每個偵測到的 header 區塊，掃描其下方資料列
  for (const { headerRow, sections } of found) {
    const startR = headerRow + 1;
    // 結束點: 下一個 header 區塊 或 sheet 末尾
    const next = found.find(f => f.headerRow > headerRow);
    const endR = next ? next.headerRow : rows.length;

    for (let r = startR; r < endR; r++) {
      const row = rows[r] || [];
      // 統計非空 cell 數: 稀疏列 (≤2) 通常是 metadata (如 HPE 的 Icon Name / Icon ID / Valid 列)
      const populated = row.filter((c) => norm(c)).length;

      for (const { skuCol, descCol } of sections) {
        const rawSku  = norm(row[skuCol]);
        const descVal = descCol >= 0 ? norm(row[descCol]) : '';
        const skuLooksReal = !!rawSku && looksLikeSku(rawSku);

        // 稀疏列 + SKU 欄不像料號 → metadata, 跳過
        if (!skuLooksReal && populated <= 2) continue;

        // 群組標題列 (Option N / TOTAL PRODUCTS / Product : XXX 1 unit Y YR) → 整列跳過
        if (isNoiseSkuCell(rawSku)) continue;
        if (isGroupHeader(descVal)) continue;

        let skuVal = skuLooksReal ? rawSku : '';
        if (!skuVal) {
          // SKU 欄空白或為標籤(如「防火牆」) → 嘗試從描述開頭抽 SKU
          const fromDesc = extractSkuFromDescPrefix(descVal);
          if (fromDesc) skuVal = fromDesc;
        }

        // 完全沒有資訊 → 跳過
        if (!skuVal && !descVal) continue;
        // boilerplate (合計/小計/Option N) → 跳過
        if (!skuVal && isBoilerplate(descVal)) continue;
        if (isBoilerplate(descVal) && !skuLooksReal) continue;

        parts.push({
          sku: skuVal || null,
          description: descVal,
          category: classify(skuVal, descVal),
          source_file: '',
          sheet: sheetName
        });
      }
    }
  }

  return { name: sheetName, parts: dedupParts(parts) };
}

// 同一 sheet 內 SKU 去重 (保留第一次出現的描述)
//   - SKU 為 null/空 的紀錄: 改用 description 做唯一鍵
function dedupParts(parts) {
  const seen = new Map();
  for (const p of parts) {
    const key = p.sku ? ('SKU:' + String(p.sku).toUpperCase()) : ('DESC:' + up(p.description));
    if (!seen.has(key)) seen.set(key, p);
    else if (!seen.get(key).description && p.description) seen.set(key, p);
  }
  return [...seen.values()];
}

function parseExcel(buffer, filename = '') {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheets = [];
  const allParts = [];

  for (const sheetName of wb.SheetNames) {
    const result = parseSheet(sheetName, wb.Sheets[sheetName]);
    for (const p of result.parts) p.source_file = filename;
    sheets.push({ name: sheetName, count: result.parts.length });
    allParts.push(...result.parts);
  }

  // 跨 sheet 全域去重
  return { sheets, parts: dedupParts(allParts) };
}

module.exports = {
  parseExcel,
  looksLikeSku,
  looksLikeSkuStrict,
  extractSkuFromDescPrefix,
  isNoiseSkuCell,
  isGroupHeader,
  isBoilerplate
};
