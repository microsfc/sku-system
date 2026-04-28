// ============================================================
//  TypeScript 型別定義 — 對應後端 SQLite schema
//  Vendor: 廠商 / Part: 料號 / ImportPreview: 匯入預覽結果
// ============================================================

export type Category = 'product' | 'license' | 'warranty';

export interface Vendor {
  id: number;
  code: string;
  name: string;
  name_en?: string;
  color: string;
  total?: number;
  product_count?: number;
  warranty_count?: number;
  license_count?: number;
}

export interface Part {
  id: number;
  vendor_id: number;
  vendor_code?: string;
  vendor_name?: string;
  vendor_color?: string;
  sku: string;
  description: string;
  category: Category;
  family?: string | null;
  family_locked?: 0 | 1 | boolean;
  source_file?: string;
  created_at?: string;
  updated_at?: string;
}

export interface FamilyStat {
  family: string;
  count: number;
  product: number;
  warranty: number;
  license: number;
}

export interface BackfillResult {
  ok: boolean;
  scope?: 'all' | 'vendor';
  vendor_id?: number | null;
  scanned: number;
  updated: number;
  unchanged: number;
  cleared: number;
  families: { family: string; count: number }[];
}

export interface ImportPart {
  sku: string | null;
  description: string;
  category: Category;
  source_file?: string;
  sheet?: string;
}

export interface ImportPreview {
  file: string;
  sheets: { name: string; count: number }[];
  total: number;
  product: number;
  warranty: number;
  license: number;
  parts: ImportPart[];
}

// 自動辨識廠商的分組預覽
export interface ImportAutoGroup {
  vendor_code: string;       // 'HPE' | 'CISCO' | ... | 'UNKNOWN'
  vendor_id: number | null;  // 已存在的 vendor.id, 否則 null
  vendor_name: string;
  vendor_name_en?: string;
  vendor_color: string;
  exists: boolean;           // DB 內已有此 vendor
  will_create: boolean;      // 將被自動建立
  count: number;
  product: number;
  warranty: number;
  license: number;
  parts: ImportPart[];
}

export interface ImportAutoPreview {
  file: string;
  sheets: { name: string; count: number }[];
  total: number;
  product: number;
  warranty: number;
  license: number;
  groups: ImportAutoGroup[];
}

export interface ImportAutoCommitResult {
  ok: boolean;
  total_inserted: number;
  results: Array<{
    vendor_code: string;
    vendor_id?: number;
    vendor_name?: string;
    created?: boolean;
    inserted: number;
    skipped?: number;
    reason?: string;
    error?: string;
  }>;
}

export interface Stats {
  total: number;
  product: number;
  warranty: number;
  license: number;
  vendors: number;
}
