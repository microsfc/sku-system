// ============================================================
//  ApiService — 前端與後端 REST API 的橋接層
//  所有 HTTP 呼叫集中此處, component 不直接打 fetch / HttpClient
// ============================================================
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BackfillResult, FamilyStat, ImportAutoCommitResult, ImportAutoGroup, ImportAutoPreview, ImportPreview, Part, Stats, Vendor } from '../models';

export interface PartsQuery {
  vendor?: number;
  q?: string;
  category?: 'product' | 'license';
  family?: string;
  limit?: number;
}

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
  private buildPartsParams(opts: PartsQuery): HttpParams {
    let params = new HttpParams();
    if (opts.vendor) params = params.set('vendor', opts.vendor);
    if (opts.q) params = params.set('q', opts.q);
    if (opts.category) params = params.set('category', opts.category);
    if (opts.family) params = params.set('family', opts.family);
    if (opts.limit) params = params.set('limit', opts.limit);
    return params;
  }
  getParts(opts: PartsQuery = {}): Observable<Part[]> {
    return this.http.get<Part[]>(`${this.base}/parts`, { params: this.buildPartsParams(opts) });
  }
  createPart(p: Partial<Part>) { return this.http.post<{ id: number }>(`${this.base}/parts`, p); }
  updatePart(id: number, p: Partial<Part>) { return this.http.patch(`${this.base}/parts/${id}`, p); }
  deletePart(id: number) { return this.http.delete(`${this.base}/parts/${id}`); }
  bulkDelete(ids: number[]) {
    return this.http.post<{ ok: boolean; deleted: number }>(`${this.base}/parts/bulk-delete`, { ids });
  }

  // ---- classification (product family) ----
  backfillFamilies(opts: { force?: boolean; vendor?: number } = {}): Observable<BackfillResult> {
    return this.http.post<BackfillResult>(`${this.base}/classify/backfill`, {
      force: !!opts.force,
      vendor: opts.vendor || null
    });
  }
  getFamilies(vendor?: number): Observable<FamilyStat[]> {
    let params = new HttpParams();
    if (vendor) params = params.set('vendor', vendor);
    return this.http.get<FamilyStat[]>(`${this.base}/families`, { params });
  }

  // ---- excel export ----
  exportSelected(ids: number[]): Observable<Blob> {
    return this.http.post(`${this.base}/export/selected`, { ids }, { responseType: 'blob' });
  }
  exportFiltered(opts: PartsQuery = {}): Observable<Blob> {
    return this.http.get(`${this.base}/export/filtered`, {
      params: this.buildPartsParams(opts),
      responseType: 'blob'
    });
  }

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

  // ---- auto-detect import (multi-vendor) ----
  previewAutoExcel(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<ImportAutoPreview>(`${this.base}/import/preview-auto`, fd);
  }
  commitAutoImport(groups: ImportAutoGroup[]) {
    return this.http.post<ImportAutoCommitResult>(`${this.base}/import/commit-auto`, { groups });
  }

  // ---- stats ----
  getStats() { return this.http.get<Stats>(`${this.base}/stats`); }
}
