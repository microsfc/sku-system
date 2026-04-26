// ============================================================
//  Excel 智慧解析器 (Smart Parser)
//
//  支援:
//   - 簡單格式 (第一列為標題, 後續為資料)
//   - 複雜格式 (報價單常見):
//       * 多列合併標題 (例如 Selling Price 跨欄)
//       * 同一份 Sheet 有多個區塊 (左半邊+右半邊各一組標題)
//       * 標題列前有空白列、Logo、報價單編號等元資料
//       * 區段分組標題 (如 "Product : PA-550 1 unit 1 YR")
//   - 中英欄位名稱: 料號 / Part Number / SKU / Model / 型號 / P/N / PN
//                  說明 / Description / Desc / 規格 / 名稱 / Product Name / 品名
// ============================================================

const XLSX = require('xlsx');
const { classify } = require('./classifier');

const SKU_HEADERS = [
  '料號', 'SKU', 'PART NUMBER', 'PART NO', 'PART NO.', 'PARTNUMBER',
  'PART#', 'PART #', 'MODEL', '型號', 'P/N', 'PN', 'ITEM', 'ITEM CODE'
];
const DESC_HEADERS = [
  '說明', '描述', 'DESCRIPTION', 'DESC', '規格', '名稱',
  'PRODUCT NAME', 'NAME', '品名', 'PRODUCT', 'ITEM DESCRIPTION'
];

// 判斷一格內容是否「看起來像料號」(可調)
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
  if (/^(product|description|qty|unit|total|price|item|no\.?|#)$/i.test(s)) return false; // 排除 header 字
  return true;
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
      // 偏好右側 (描述通常在料號右邊)，距離相同時取右側
      const adj = dc > skuCol ? dist : dist + 0.5;
      if (adj < bestDist) { bestDist = adj; best = dc; }
    }
    return { skuCol, descCol: best };
  });
  return sections;
}

// 在前 N 列掃描，找出所有 (header row, [{skuCol, descCol}]) 區塊
function findAllSections(rows, scanLimit = 30) {
  const found = []; // { headerRow, sections }
  const limit = Math.min(rows.length, scanLimit);
  for (let r = 0; r < limit; r++) {
    const sections = detectSectionsInRow(rows[r] || []);
    if (sections.length > 0) found.push({ headerRow: r, sections });
  }
  return found;
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
          // 嘗試取右側相鄰非空 cell 為說明
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
    return { name: sheetName, parts };
  }

  // 對每個偵測到的 header 區塊，掃描其下方資料列
  for (const { headerRow, sections } of found) {
    const startR = headerRow + 1;
    // 結束點: 下一個 header 區塊 或 sheet 末尾
    const next = found.find(f => f.headerRow > headerRow);
    const endR = next ? next.headerRow : rows.length;

    for (let r = startR; r < endR; r++) {
      const row = rows[r] || [];
      for (const { skuCol, descCol } of sections) {
        const skuVal = norm(row[skuCol]);
        if (!skuVal || !looksLikeSku(skuVal)) continue;
        const descVal = descCol >= 0 ? norm(row[descCol]) : '';
        parts.push({
          sku: skuVal,
          description: descVal,
          category: classify(skuVal, descVal),
          source_file: '',
          sheet: sheetName
        });
      }
    }
  }

  // 同一 sheet 內 SKU 去重 (保留第一次出現的描述)
  const seen = new Map();
  for (const p of parts) {
    const key = p.sku.toUpperCase();
    if (!seen.has(key)) seen.set(key, p);
    else if (!seen.get(key).description && p.description) seen.set(key, p);
  }
  return { name: sheetName, parts: [...seen.values()] };
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
  const seen = new Map();
  for (const p of allParts) {
    const key = p.sku.toUpperCase();
    if (!seen.has(key)) seen.set(key, p);
  }
  return { sheets, parts: [...seen.values()] };
}

module.exports = { parseExcel, looksLikeSku };
