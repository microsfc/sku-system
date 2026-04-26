// ============================================================
//  TypeScript 型別定義 — 對應後端 SQLite schema
//  Vendor: 廠商 / Part: 料號 / ImportPreview: 匯入預覽結果
// ============================================================

export interface Vendor {
  id: number;
  code: string;
  name: string;
  name_en?: string;
  color: string;
  total?: number;
  product_count?: number;
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
  category: 'product' | 'license';
  source_file?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ImportPreview {
  file: string;
  sheets: { name: string; count: number }[];
  total: number;
  product: number;
  license: number;
  parts: Array<{ sku: string; description: string; category: 'product' | 'license'; source_file: string; sheet: string }>;
}

export interface Stats {
  total: number;
  product: number;
  license: number;
  vendors: number;
}
