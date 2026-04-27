// ============================================================
//  AppComponent — 主畫面
//  - Top App Bar (搜尋 / 匯入 / 新增廠商 / 中英切換)
//  - KPI Cards (總料號數 / 產品 / 授權 / 廠商)
//  - Vendor Tabs (動態渲染所有代理廠商)
//  - Filter Row (全部/產品/授權 三選一篩選 + 新增料號 + 匯出 + 分類)
//  - Parts Table (列出料號, 支援多選 / 批次刪除 / 編輯 / family 顯示)
// ============================================================
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatBadgeModule } from '@angular/material/badge';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { debounceTime, Subject } from 'rxjs';
import { ApiService } from './services/api.service';
import { I18nService } from './services/i18n.service';
import { FamilyStat, Part, Stats, Vendor } from './models';
import { ImportDialogComponent } from './dialogs/import-dialog.component';
import { VendorDialogComponent } from './dialogs/vendor-dialog.component';
import { PartDialogComponent } from './dialogs/part-dialog.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatToolbarModule, MatButtonModule, MatIconModule, MatTabsModule, MatTableModule,
    MatFormFieldModule, MatInputModule, MatChipsModule, MatSelectModule, MatDialogModule,
    MatSnackBarModule, MatTooltipModule, MatBadgeModule, MatCardModule, MatDividerModule,
    MatMenuModule, MatCheckboxModule, MatSlideToggleModule
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  api = inject(ApiService);
  i18n = inject(I18nService);
  dialog = inject(MatDialog);
  snack = inject(MatSnackBar);

  vendors = signal<Vendor[]>([]);
  parts = signal<Part[]>([]);
  stats = signal<Stats>({ total: 0, product: 0, license: 0, vendors: 0 });
  families = signal<FamilyStat[]>([]);

  selectedVendorIdx = signal<number>(0);    // 0 = ALL, 1+ = vendor index
  searchTerm = signal<string>('');
  category = signal<'all' | 'product' | 'license'>('all');
  familyFilter = signal<string>('');         // '' = 不過濾 family
  groupByFamily = signal<boolean>(false);

  // 多選 state — 用 Set 紀錄被勾選的 part.id
  selectedIds = signal<Set<number>>(new Set());

  cols = ['select', 'sku', 'description', 'family', 'category', 'vendor', 'updated', 'actions'];
  searchSubject = new Subject<string>();

  // ---- computed ----
  selectedCount = computed(() => this.selectedIds().size);
  allSelected = computed(() => {
    const ids = this.selectedIds();
    const list = this.parts();
    return list.length > 0 && list.every(p => ids.has(p.id));
  });
  someSelected = computed(() => {
    const ids = this.selectedIds();
    return this.parts().some(p => ids.has(p.id)) && !this.allSelected();
  });

  // 依 family 分組顯示
  groupedParts = computed<{ family: string; items: Part[] }[]>(() => {
    if (!this.groupByFamily()) return [];
    const map = new Map<string, Part[]>();
    for (const p of this.parts()) {
      const key = (p.family && String(p.family).trim()) || '__UNCLASSIFIED__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()]
      .sort((a, b) => {
        if (a[0] === '__UNCLASSIFIED__') return 1;
        if (b[0] === '__UNCLASSIFIED__') return -1;
        return b[1].length - a[1].length || a[0].localeCompare(b[0]);
      })
      .map(([family, items]) => ({ family, items }));
  });

  ngOnInit() {
    this.loadVendors();
    this.loadStats();
    this.refresh();
    this.loadFamilies();

    this.searchSubject.pipe(debounceTime(250)).subscribe((v) => {
      this.searchTerm.set(v);
      this.refresh();
    });
  }

  // ---- selection helpers ----
  currentVendor(): Vendor | null {
    const i = this.selectedVendorIdx();
    if (i === 0) return null;
    return this.vendors()[i - 1] ?? null;
  }

  // ---- data loading ----
  loadVendors() {
    this.api.getVendors().subscribe((v) => this.vendors.set(v));
  }
  loadStats() {
    this.api.getStats().subscribe((s) => this.stats.set(s));
  }
  loadFamilies() {
    const v = this.currentVendor();
    this.api.getFamilies(v?.id).subscribe((f) => this.families.set(f));
  }
  refresh() {
    const v = this.currentVendor();
    const cat = this.category();
    const fam = this.familyFilter();
    this.api.getParts({
      vendor: v?.id,
      q: this.searchTerm() || undefined,
      category: cat === 'all' ? undefined : cat,
      family: fam || undefined
    }).subscribe((p) => {
      this.parts.set(p);
      // 清除已不在當前列表的選取
      const visibleIds = new Set(p.map(x => x.id));
      const stillSelected = new Set<number>();
      for (const id of this.selectedIds()) {
        if (visibleIds.has(id)) stillSelected.add(id);
      }
      this.selectedIds.set(stillSelected);
    });
  }

  // ---- UI handlers ----
  onTabChange(i: number) {
    this.selectedVendorIdx.set(i);
    this.familyFilter.set('');  // 切廠商時清掉 family 篩選
    this.refresh();
    this.loadFamilies();
  }
  onSearch(v: string) { this.searchSubject.next(v); }
  onCategoryChange(c: 'all'|'product'|'license') { this.category.set(c); this.refresh(); }
  onFamilyFilter(f: string) { this.familyFilter.set(f); this.refresh(); }
  toggleGroupByFamily() { this.groupByFamily.set(!this.groupByFamily()); }

  openImport() {
    const v = this.currentVendor();
    this.dialog.open(ImportDialogComponent, {
      data: { vendors: this.vendors(), defaultVendorId: v?.id }
    }).afterClosed().subscribe((r) => {
      if (r?.ok) { this.loadVendors(); this.loadStats(); this.loadFamilies(); this.refresh(); }
    });
  }

  openAddVendor() {
    this.dialog.open(VendorDialogComponent, {
      data: {}
    }).afterClosed().subscribe((r) => {
      if (r?.ok) {
        this.loadVendors();
        this.loadStats();
        this.refresh();
      }
    });
  }

  openAddPart() {
    const v = this.currentVendor();
    this.dialog.open(PartDialogComponent, {
      data: { vendors: this.vendors(), vendorId: v?.id }
    }).afterClosed().subscribe((r) => {
      if (r?.ok) { this.loadStats(); this.loadFamilies(); this.refresh(); }
    });
  }

  editPart(p: Part) {
    this.dialog.open(PartDialogComponent, {
      data: { vendors: this.vendors(), part: p }
    }).afterClosed().subscribe((r) => {
      if (r?.ok) { this.loadStats(); this.loadFamilies(); this.refresh(); }
    });
  }

  deletePart(p: Part) {
    if (!confirm(`${this.i18n.t('delete')}: ${p.sku || p.description} ?`)) return;
    this.api.deletePart(p.id).subscribe(() => {
      this.snack.open('Deleted', 'OK', { duration: 1500 });
      this.loadStats();
      this.loadFamilies();
      this.refresh();
    });
  }

  deleteVendor(v: Vendor) {
    if (!confirm(`${this.i18n.t('delete')} ${v.name} (${v.code}) ? \n所有相關料號將一併刪除`)) return;
    this.api.deleteVendor(v.id).subscribe(() => {
      this.snack.open('Vendor deleted', 'OK', { duration: 2000 });
      this.selectedVendorIdx.set(0);
      this.loadVendors();
      this.loadStats();
      this.loadFamilies();
      this.refresh();
    });
  }

  // ---- multi-select helpers ----
  toggleSelect(id: number) {
    const s = new Set(this.selectedIds());
    if (s.has(id)) s.delete(id); else s.add(id);
    this.selectedIds.set(s);
  }
  isSelected(id: number): boolean { return this.selectedIds().has(id); }
  toggleSelectAll() {
    if (this.allSelected()) {
      this.selectedIds.set(new Set());
    } else {
      this.selectedIds.set(new Set(this.parts().map(p => p.id)));
    }
  }
  clearSelection() { this.selectedIds.set(new Set()); }

  batchDelete() {
    const ids = [...this.selectedIds()];
    if (ids.length === 0) return;
    if (!confirm(`${this.i18n.t('confirmBatchDel')} (${ids.length})`)) return;
    this.api.bulkDelete(ids).subscribe((r) => {
      this.snack.open(`${r.deleted} ${this.i18n.t('rows')} ${this.i18n.t('delete')}`, 'OK', { duration: 1800 });
      this.clearSelection();
      this.loadStats();
      this.loadFamilies();
      this.refresh();
    });
  }

  // ---- 一鍵分類 (依當前 tab 範圍) ----
  classifyAllInDb() {
    const v = this.currentVendor();
    const scopeLabel = v
      ? `${this.i18n.t('classifyVendor')} — ${v.code}`
      : this.i18n.t('classifyAll');
    if (!confirm(`${scopeLabel} ?\n(${this.i18n.t('familyLocked')} 之資料不影響)`)) return;
    this.api.backfillFamilies({ vendor: v?.id }).subscribe((r) => {
      this.snack.open(
        `${this.i18n.t('classifyDone')} — ${r.updated}/${r.scanned} ${this.i18n.t('rows')}`,
        'OK', { duration: 2400 }
      );
      this.loadFamilies();
      this.loadStats();
      this.refresh();
    });
  }

  // ---- Excel 匯出 ----
  private downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  exportSelected() {
    const ids = [...this.selectedIds()];
    if (ids.length === 0) {
      this.snack.open(this.i18n.t('noData'), 'OK', { duration: 1500 });
      return;
    }
    this.api.exportSelected(ids).subscribe((blob) => {
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      this.downloadBlob(blob, `parts-selected-${ts}.xlsx`);
    });
  }
  exportFiltered() {
    const v = this.currentVendor();
    const cat = this.category();
    this.api.exportFiltered({
      vendor: v?.id,
      q: this.searchTerm() || undefined,
      category: cat === 'all' ? undefined : cat,
      family: this.familyFilter() || undefined
    }).subscribe((blob) => {
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      this.downloadBlob(blob, `parts-filtered-${ts}.xlsx`);
    });
  }

  toggleLang() { this.i18n.toggle(); }
}
