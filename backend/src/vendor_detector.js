// ============================================================
//  廠商自動辨識器
//  依 SKU 樣式或描述關鍵字猜測料號隸屬的代理廠商
//  傳回值: { code, name, name_en, color }  或 null (無法辨識)
// ============================================================

// 各廠商的 SKU pattern + 描述關鍵字
//   - skuPatterns 為 RegExp 陣列, 任一命中即視為該廠商
//   - descKeywords 為大寫關鍵字陣列, 任一出現於描述中亦視為該廠商
//   - 比對順序很重要: 較具體的廠商放前面 (例: HPE 在 Cisco 之前)
const VENDOR_RULES = [
  {
    code: 'PA',
    name: 'Palo Alto 防火牆',
    name_en: 'Palo Alto Networks',
    color: '#FA582D',
    skuPatterns: [
      /^PA-\d/i,                    // PA-440, PA-1410
      /^PAN-/i                      // PAN-SVC-, PAN-PA-
    ],
    descKeywords: ['PALO ALTO', 'PAN-DB', 'WILDFIRE', 'PANORAMA']
  },
  {
    code: 'FORTI',
    name: 'Fortinet 產品',
    name_en: 'Fortinet',
    color: '#EE3124',
    skuPatterns: [
      /^FG-/i,                      // FG-100F, FG-200F
      /^FGT-/i,                     // FortiGate alt prefix
      /^FAP-/i,                     // FortiAP
      /^FS-/i,                      // FortiSwitch
      /^FAZ-/i, /^FMG-/i, /^FAC-/i, // FortiAnalyzer / Manager / Authenticator
      /^FC-\d/i                     // FortiCare / FortiGuard 服務 (FC-10-XXXX)
    ],
    descKeywords: [
      'FORTINET', 'FORTIGATE', 'FORTICARE', 'FORTIGUARD',
      'FORTIAP', 'FORTISWITCH', 'FORTIANALYZER', 'FORTIMANAGER'
    ]
  },
  {
    code: 'HPE',
    name: 'HPE 伺服器',
    name_en: 'Hewlett Packard Enterprise',
    color: '#01A982',
    skuPatterns: [
      // HPE option kits 通常以 P/Q/R/S/H/B/A + 數字 + -B21/-B22 結尾
      /^[PQRSHB]\d{4,5}[A-Z]?-B\d{2}$/i,            // P52534-B21, P67092-B21
      /^[A-Z]{1,2}\d{2,4}[A-Z]\d?$/i,               // R2J62A, BD505A, AF559A, S1A05A (短碼)
      /^HU\w{4,}$/i,                                 // HU4A6A3, HU4A6A300DK (Tech Care)
      /^R\d[A-Z]\d{2}[A-Z]{2,3}$/i                   // R7A11AAE
    ],
    descKeywords: [
      'HPE ', 'PROLIANT', 'HEWLETT PACKARD', 'HEWLETT-PACKARD',
      'ILO ', 'SYNERGY', 'APOLLO', 'SUPERDOME', 'GEN10', 'GEN11', 'GEN12'
    ]
  },
  {
    code: 'CISCO',
    name: 'Cisco 產品',
    name_en: 'Cisco Systems',
    color: '#1BA0D7',
    skuPatterns: [
      /^C\d{3,4}[A-Z]?-/i,          // C9300-, C9200-, C8300-, C1300-, C9105AXI-
      /^C\d{3,4}[A-Z]?\b/i,          // C9300X, C8300, C9800
      /^CON-/i,                      // CON-SNT-
      /^SNTC-/i,                     // SNTC-8X5XNBD
      /^DNA-/i,                      // DNA-P-T1-A-3Y, DNA-E-3Y-...
      /^SL-/i,                       // SL-ASR1001X-AIS
      /^MEM-C\d/i,                   // MEM-C8300-8GB
      /^M2USB-/i, /^C-RFID-/i, /^SC\d/i, /^IOSXE-/i,
      /^PWR-C\d/i, /^CAB-/i, /^AIR-/i,
      /^C9300-/i, /^C9200-/i, /^C8300-/i, /^C8000-/i, /^C1300-/i, /^C9105/i, /^C9800-/i,
      /^ASR\d/i, /^ISR\d/i, /^WS-/i, /^N\d[KX]-/i,
      /^TE-/i,                       // TE-CSK-SW, TE-EMBEDDED-T (ThousandEyes / Tracer)
      /^SVS-/i, /^SDWAN-/i, /^DNAC-/i,
      /^NETWORK-PNP-/i, /^NWSTACK-/i, /^DSTACK-/i,
      /^IOSXE-/i
    ],
    descKeywords: [
      'CISCO', 'CATALYST', 'MERAKI', 'ASR', 'IOS XE', 'IOSXE',
      'SMARTNET', 'THOUSANDEYES', 'C9300', 'C9200', 'C8300', 'C9105'
    ]
  }
];

function up(s) { return String(s || '').toUpperCase().trim(); }

/**
 * 依 SKU + 描述偵測廠商
 * @returns vendor 物件 (含 code/name/name_en/color) 或 null
 */
function detectVendor(sku, description) {
  const skuU = up(sku);
  const descU = up(description);

  // 第一輪: SKU pattern 比對
  for (const v of VENDOR_RULES) {
    if (skuU) {
      for (const re of v.skuPatterns) {
        if (re.test(skuU)) return summarize(v);
      }
    }
  }

  // 第二輪: 描述關鍵字
  for (const v of VENDOR_RULES) {
    for (const kw of v.descKeywords) {
      if (kw && descU.includes(kw)) return summarize(v);
    }
  }

  return null;
}

function summarize(v) {
  return { code: v.code, name: v.name, name_en: v.name_en, color: v.color };
}

module.exports = { detectVendor, VENDOR_RULES };
