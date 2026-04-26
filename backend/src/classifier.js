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

module.exports = { classify, LICENSE_KEYWORDS };
