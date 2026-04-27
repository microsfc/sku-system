// ============================================================
//  料號分類器 — 依命名規則自動判斷「產品」或「授權」料號
// ============================================================

// 出現在 SKU 或 描述任一處 即視為 license 的關鍵字
const LICENSE_KEYWORDS = [
  'LIC', 'LICENSE', 'LICENCE',
  'SUB', 'SUBSCRIPTION', 'SUBS',
  'RNW', 'RENEW', 'RENEWAL',
  'SUPPORT', 'SUP', 'SUPP',
  'MAINT', 'MAINTENANCE',
  'WARRANTY', 'WTY',
  'SVC', 'SERVICE',
  'TAC', 'PSP',
  'PREMIUM-PARTNER', 'FORTICARE', 'PANDB', 'THREAT-PREV',
  'PREVENTION', 'FILTERING', 'WILDFIRE',
  'SMARTNET', 'SNTC', 'TERM',
  'BUNDLE', 'CARE'
];

// SKU 開頭即視為 license 的前綴
//   FC-  Fortinet FortiCare / FortiGuard 服務
//   SL-  Cisco Software License
//   L-   一般 License 簡寫
//   PAN-SVC-  Palo Alto Service
//   CON-     Cisco Service Contract (SmartNet)
const SKU_LICENSE_PREFIXES = ['FC-', 'SL-', 'L-', 'PAN-SVC-', 'CON-'];

// 描述中含「N year(s)」/「N month(s)」/「N-year」之 subscription pattern
const SUBSCRIPTION_TIME_RE = /(\b\d+\s*-?\s*(?:YEAR|MONTH|MO|YR)S?\b)|((?:^|\W)\d+Y\b)/i;
// 「(12 months) term」「1Y term」等 term pattern
const TERM_RE = /\bTERM\b/i;

// ---- Product Family 推導 -------------------------------------------------
//   PA-440 / PA-440-LIC-TP / PA-440-SUP-PREMIUM / PA-440-RNW-TP → 'PA-440'
//   FG-100F / FG-100F-BDL-... / FC-10-0100F-... → 'FG-100F'
//   C9300-24T-A / C9300-24T-E → 'C9300-24T'
//   FortiGate-200G ... → 'FG-200G'
//   HPE: P19562-B21 (DL360 Gen10) — 不易拆, 預設保留全 SKU
//
// 設計策略:
//   1. 已知前綴: 從描述/SKU 中找出主機型號片段
//   2. SKU 拆解: 移除已知服務後綴 (-LIC-*, -SUP-*, -RNW-*, -BDL-*, -CARE-*)
//   3. 服務料號 (FC-..., SL-..., CON-...) → 嘗試從描述抽出母機型號
//   4. 都失敗則回傳 null

// 服務型 SKU 後綴, 砍掉後留下主機型號
const SERVICE_SUFFIX_RE = /-(LIC|LICENSE|LICENCE|SUP|SUPPORT|SUPP|SUB|SUBS|SUBSCRIPTION|RNW|RENEW|RENEWAL|MAINT|WTY|WARRANTY|SVC|SERVICE|SMARTNET|SNTC|FORTICARE|CARE|BDL|BUNDLE|PREMIUM|TP|THREAT|WILDFIRE|PANDB|URL|GP|VM|DNS|SDP|SAAS|ATP|EPP|SOAR|SOC|FAB|TERM|TAC|CON)\b.*$/i;

// 從文字中抓「主機型號」(Palo Alto / Fortinet / Cisco / 常見)
function findModelToken(text) {
  if (!text) return '';
  const s = String(text).toUpperCase();
  // Palo Alto: PA-220 / PA-440 / PA-1410 / PA-3410 / PA-5450
  let m = s.match(/\bPA-\d{3,4}[A-Z]?\b/);
  if (m) return m[0];
  // FortiGate / FortiSwitch / FortiAP shorthand: FG-100F, FG-60F, FG-201F, FS-148F-POE, FAP-431G
  m = s.match(/\b(FG|FS|FAP|FWB|FAZ|FMG|FAC|FCT|FNDR)-[0-9]{2,4}[A-Z]{0,3}(?:-(?:POE|DC|FPOE))?\b/);
  if (m) return m[0];
  // Cisco Catalyst with port suffix: C9300-24T, C9300L-48P, C9200-24T, C8500L-8S4X
  m = s.match(/\bC\d{3,4}[A-Z]?-[0-9]{1,3}[A-Z]{0,3}\b/);
  if (m) return m[0];
  // Cisco Catalyst plain model (no -port): C9300, C9300X, C9500, C8500L
  m = s.match(/\b(C\d{3,4}[A-Z]?)\b/);
  if (m) return m[1];
  // Cisco Catalyst from description "Catalyst 9300X smart net" → C9300X
  m = s.match(/\bCATALYST\s+(\d{3,4}[A-Z]?)\b/);
  if (m) return 'C' + m[1];
  // FortiGate full name in description: "FortiGate-200G"
  m = s.match(/\bFORTIGATE-?(\d{2,4}[A-Z]*(?:-(?:POE|DC|FPOE))?)\b/);
  if (m) return 'FG-' + m[1];
  m = s.match(/\bFORTISWITCH-?(\d{2,4}[A-Z]*(?:-(?:POE|DC|FPOE))?)\b/);
  if (m) return 'FS-' + m[1];
  m = s.match(/\bFORTIAP-?(\d{2,4}[A-Z]*)\b/);
  if (m) return 'FAP-' + m[1];
  // HPE ProLiant DLxxx Gen10/11: 描述常見 "DL360 Gen10"
  m = s.match(/\bDL\d{3}\s+GEN\s*\d+[A-Z]*\b/);
  if (m) return m[0].replace(/\s+/g, ' ').trim();
  // Aruba: 6300M / CX 6300M
  m = s.match(/\bCX\s*\d{4}[A-Z]?\b/);
  if (m) return m[0].replace(/\s+/g, '');
  return '';
}

// 主入口: 由 SKU + 描述推導 family
//   優先級: 1) SKU 砍服務後綴 → 2) SKU 找型號 token → 3) 描述找型號 token
function extractFamily(sku, description) {
  const skuRaw  = String(sku || '').trim();
  const descRaw = String(description || '').trim();
  if (!skuRaw && !descRaw) return null;

  // 1. SKU 砍服務後綴 (e.g. "PA-440-LIC-TP" → "PA-440")
  if (skuRaw) {
    const stripped = skuRaw.toUpperCase().replace(SERVICE_SUFFIX_RE, '');
    // 砍完後仍合理 (含字母與數字, 至少 4 字元) 才採用
    if (
      stripped.length >= 4 &&
      stripped.length < skuRaw.length &&
      /[A-Z]/.test(stripped) &&
      /\d/.test(stripped) &&
      !/-$/.test(stripped)
    ) {
      const inFromStrip = findModelToken(stripped);
      if (inFromStrip) return inFromStrip;
      return stripped;
    }
  }

  // 2. SKU 找型號 token
  const skuModel = findModelToken(skuRaw);
  if (skuModel) return skuModel;

  // 3. 描述找型號 token (服務料號常見, e.g. SKU=PAN-PA-440-LIC-TP / desc 提到 PA-440)
  const descModel = findModelToken(descRaw);
  if (descModel) return descModel;

  // 4. SKU 不空: 取頭兩段 hyphen 作為粗略 family
  if (skuRaw && /-/.test(skuRaw)) {
    const segs = skuRaw.toUpperCase().split('-');
    if (segs.length >= 2 && /[A-Z]/.test(segs[0])) {
      // 第二段需含數字才認為是型號
      if (/\d/.test(segs[1])) return segs[0] + '-' + segs[1];
    }
  }

  return null;
}

function classify(sku, description) {
  const skuU = String(sku || '').toUpperCase().trim();
  const descU = String(description || '').toUpperCase();
  const text = skuU + ' ' + descU;

  // 1. SKU 開頭前綴
  for (const prefix of SKU_LICENSE_PREFIXES) {
    if (skuU.startsWith(prefix)) return 'license';
  }

  // 2. 授權關鍵字 (SKU 或 描述)
  for (const kw of LICENSE_KEYWORDS) {
    const re = new RegExp('(^|[^A-Z0-9])' + kw + '([^A-Z0-9]|$)');
    if (re.test(text)) return 'license';
  }

  // 3. 描述含期間 + term/subscription pattern (例: "1 year term", "12 months term")
  if (SUBSCRIPTION_TIME_RE.test(descU) && TERM_RE.test(descU)) {
    return 'license';
  }

  return 'product';
}

module.exports = { classify, extractFamily, findModelToken, LICENSE_KEYWORDS };
