// ============================================================
//  AppComponent — 主畫面
//  - Top App Bar (搜尋 / 匯入 / 新增廠商 / 中英切換)
//  - KPI Cards (總料號數 / 產品 / 授權 / 廠商)
//  - Vendor Tabs (動態渲染所有代理廠商)
//  - Filter Row (全部/產品/授權 三選一篩選 + 新增料號)
//  - Parts Table (列出料號, 支援編輯/刪除)
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
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatBadgeModule } from '@angular/material/badge';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule } from '@angular/material/menu';
import { debounceTime, Subject } from 'rxjs';
import { ApiService } from './services/api.service';
import { I18nService } from './services/i18n.service';
import { Part, Stats, Vendor } from './models';
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
    MatMenuModule
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

  selectedVendorIdx = signal<number>(0);    // 0 = ALL, 1+ = vendor index
  searchTerm = signal<string>('');
  category = signal<'all' | 'product' | 'license'>('all');

  cols = ['sku', 'description', 'category', 'vendor', 'updated', 'actions'];
  searchSubject = new Subject<string>();

  ngOnInit() {
    this.loadVendors();
    this.loadStats();
    this.refresh();

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
  refresh() {
    const v = this.currentVendor();
    const cat = this.category();
    this.api.getParts({
      vendor: v?.id,
      q: this.searchTerm() || undefined,
      category: cat === 'all' ? undefined : cat
    }).subscribe((p) => this.parts.set(p));
  }

  // ---- UI handlers ----
  onTabChange(i: number) {
    this.selectedVendorIdx.set(i);
    this.refresh();
  }
  onSearch(v: string) { this.searchSubject.next(v); }
  onCategoryChange(c: 'all'|'product'|'license') { this.category.set(c); this.refresh(); }

  openImport() {
    const v = this.currentVendor();
    this.dialog.open(ImportDialogComponent, {
      data: { vendors: this.vendors(), defaultVendorId: v?.id }
    }).afterClosed().subscribe((r) => {
      if (r?.ok) { this.loadVendors(); this.loadStats(); this.refresh(); }
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
      if (r?.ok) { this.loadStats(); this.refresh(); }
    });
  }

  editPart(p: Part) {
    this.dialog.open(PartDialogComponent, {
      data: { vendors: this.vendors(), part: p }
    }).afterClosed().subscribe((r) => {
      if (r?.ok) { this.loadStats(); this.refresh(); }
    });
  }

  deletePart(p: Part) {
    if (!confirm(`${this.i18n.t('delete')}: ${p.sku} ?`)) return;
    this.api.deletePart(p.id).subscribe(() => {
      this.snack.open('Deleted', 'OK', { duration: 1500 });
      this.loadStats();
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
      this.refresh();
    });
  }

  toggleLang() { this.i18n.toggle(); }
}
