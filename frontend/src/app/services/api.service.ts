// ============================================================
//  ApiService — 前端與後端 REST API 的橋接層
//  所有 HTTP 呼叫集中此處, component 不直接打 fetch / HttpClient
// ============================================================
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ImportPreview, Part, Stats, Vendor } from '../models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = '/api';

  // ---- vendors ----
  getVendors(): Observable<Vendor[]> { return this.http.get<Vendor[]>(`${this.base}/vendors`); }
  createVendor(v: Partial<Vendor>) { return this.http.post<{ id: number }>(`${this.base}/vendors`, v); }
  updateVendor(id: number, v: Partial<Vendor>) { return this.http.patch(`${this.base}/vendors/${id}`, v); }
  deleteVendor(id: number) { return this.http.delete(`${this.base}/vendors/${id}`); }

  // ---- parts ----
  getParts(opts: { vendor?: number; q?: string; category?: 'product'|'license'; limit?: number } = {}): Observable<Part[]> {
    let params = new HttpParams();
    if (opts.vendor) params = params.set('vendor', opts.vendor);
    if (opts.q) params = params.set('q', opts.q);
    if (opts.category) params = params.set('category', opts.category);
    if (opts.limit) params = params.set('limit', opts.limit);
    return this.http.get<Part[]>(`${this.base}/parts`, { params });
  }
  createPart(p: Partial<Part>) { return this.http.post<{ id: number }>(`${this.base}/parts`, p); }
  updatePart(id: number, p: Partial<Part>) { return this.http.patch(`${this.base}/parts/${id}`, p); }
  deletePart(id: number) { return this.http.delete(`${this.base}/parts/${id}`); }

  // ---- import ----
  previewExcel(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<ImportPreview>(`${this.base}/import/preview`, fd);
  }
  commitImport(vendor_id: number, parts: any[]) {
    return this.http.post<{ ok: boolean; inserted: number }>(`${this.base}/import/commit`, { vendor_id, parts });
  }
  importNewVendor(form: { code: string; name: string; name_en?: string; color?: string; file: File }) {
    const fd = new FormData();
    fd.append('code', form.code);
    fd.append('name', form.name);
    if (form.name_en) fd.append('name_en', form.name_en);
    if (form.color) fd.append('color', form.color);
    fd.append('file', form.file);
    return this.http.post<{ vendor_id: number; inserted: number }>(`${this.base}/import/new-vendor`, fd);
  }

  // ---- stats ----
  getStats() { return this.http.get<Stats>(`${this.base}/stats`); }
}
