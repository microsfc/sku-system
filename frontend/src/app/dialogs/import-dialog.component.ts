// ============================================================
//  ImportDialogComponent — 匯入 Excel 對話框
//
//  兩種模式 (Mode):
//   1. auto   (預設) — 系統依 SKU/描述自動辨識廠商, 將同一份 Excel 拆成
//                       多組分別寫入。已存在的 vendor 直接 append, 未存在
//                       的 vendor 一鍵自動建立並寫入。
//   2. manual         — 舊行為: 使用者選一個 vendor, 全部資料寫入該 vendor
// ============================================================
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatRadioModule } from '@angular/material/radio';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Inject } from '@angular/core';
import { ApiService } from '../services/api.service';
import { I18nService } from '../services/i18n.service';
import { ImportAutoGroup, ImportAutoPreview, ImportPreview, Vendor } from '../models';

type Mode = 'auto' | 'manual';

@Component({
  selector: 'app-import-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatSelectModule, MatTableModule, MatProgressBarModule,
    MatChipsModule, MatRadioModule, MatExpansionModule, MatTooltipModule
  ],
  template: `
  <h2 mat-dialog-title>
    <mat-icon style="vertical-align: middle; margin-right:8px;">upload_file</mat-icon>
    {{ i18n.t('importExcel') }}
  </h2>

  <mat-dialog-content style="min-width: 760px; max-height: 70vh;">
    <!-- 模式選擇 -->
    <div class="mode-row">
      <span class="mode-label">{{ i18n.t('importMode') }}:</span>
      <mat-radio-group [(ngModel)]="mode" (change)="onModeChange()">
        <mat-radio-button value="auto">{{ i18n.t('modeAuto') }}</mat-radio-button>
        <mat-radio-button value="manual" style="margin-left: 16px;">{{ i18n.t('modeManual') }}</mat-radio-button>
      </mat-radio-group>
    </div>

    <!-- 檔案 + (manual 模式: 廠商選擇) -->
    <div class="upload-row">
      <button mat-stroked-button color="primary" (click)="fi.click()">
        <mat-icon>folder_open</mat-icon>
        {{ i18n.t('selectFile') }}
      </button>
      <input #fi type="file" accept=".xlsx,.xls" hidden (change)="onPick($event)">
      <span class="filename">{{ fileName() || '—' }}</span>

      <span class="spacer"></span>

      @if (mode === 'manual') {
        <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:240px;">
          <mat-label>{{ i18n.t('vendors') }}</mat-label>
          <mat-select [(ngModel)]="vendorId">
            @for (v of vendors; track v.id) {
              <mat-option [value]="v.id">{{ v.name }} ({{ v.code }})</mat-option>
            }
          </mat-select>
        </mat-form-field>
      }
    </div>

    @if (loading()) {
      <mat-progress-bar mode="indeterminate"></mat-progress-bar>
    }

    <!-- ============== AUTO 模式: 分組預覽 ============== -->
    @if (mode === 'auto' && autoPreview(); as ap) {
      <div class="summary">
        <div class="stat">
          <span class="label">{{ i18n.t('total') }}</span>
          <span class="num">{{ ap.total }}</span>
        </div>
        <div class="stat product">
          <span class="label">{{ i18n.t('product') }}</span>
          <span class="num">{{ ap.product }}</span>
        </div>
        <div class="stat license">
          <span class="label">{{ i18n.t('license') }}</span>
          <span class="num">{{ ap.license }}</span>
        </div>
        <div class="stat sheets">
          <span class="label">Sheets</span>
          <span class="chips">
            @for (s of ap.sheets; track s.name) {
              <mat-chip>{{ s.name }} · {{ s.count }}</mat-chip>
            }
          </span>
        </div>
      </div>

      <div class="groups">
        @for (g of ap.groups; track g.vendor_code; let idx = $index) {
          <mat-expansion-panel class="group-panel" [expanded]="idx === 0">
            <mat-expansion-panel-header>
              <mat-panel-title>
                <span class="vendor-dot" [style.background]="g.vendor_color"></span>
                <span class="vendor-name">{{ g.vendor_name }}</span>
                <span class="vendor-code">{{ g.vendor_code }}</span>

                @if (g.exists) {
                  <span class="badge existing">{{ i18n.t('existingVendor') }}</span>
                }
                @if (g.will_create) {
                  <span class="badge create" matTooltip="新增廠商: {{ g.vendor_name }} ({{ g.vendor_code }})">
                    + {{ i18n.t('willCreateVendor') }}
                  </span>
                }
                @if (!g.exists && !g.will_create) {
                  <span class="badge unknown">{{ i18n.t('unknownVendor') }}</span>
                }
              </mat-panel-title>
              <mat-panel-description>
                <span class="count">{{ g.count }} {{ i18n.t('rows') }}</span>
                <span class="mini product">P {{ g.product }}</span>
                <span class="mini license">L {{ g.license }}</span>
              </mat-panel-description>
            </mat-expansion-panel-header>

            <!-- UNKNOWN 群組: 提供手動指定 vendor 或略過 -->
            @if (!g.exists && !g.will_create) {
              <div class="assign-row">
                <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width: 280px;">
                  <mat-label>{{ i18n.t('pickVendor') }}</mat-label>
                  <mat-select [(ngModel)]="g.vendor_id" (selectionChange)="onAssignVendor(g)">
                    <mat-option [value]="null">— {{ i18n.t('skipGroup') }} —</mat-option>
                    @for (v of vendors; track v.id) {
                      <mat-option [value]="v.id">{{ v.name }} ({{ v.code }})</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <span class="assign-hint">系統未自動辨識出此群組的廠商，請手動選擇或略過。</span>
              </div>
            }

            <div class="preview-table">
              <table mat-table [dataSource]="g.parts.slice(0, 50)">
                <ng-container matColumnDef="sku">
                  <th mat-header-cell *matHeaderCellDef>{{ i18n.t('sku') }}</th>
                  <td mat-cell *matCellDef="let r">
                    @if (r.sku) { {{ r.sku }} }
                    @else { <span class="no-sku">(no SKU)</span> }
                  </td>
                </ng-container>
                <ng-container matColumnDef="description">
                  <th mat-header-cell *matHeaderCellDef>{{ i18n.t('description') }}</th>
                  <td mat-cell *matCellDef="let r">{{ r.description }}</td>
                </ng-container>
                <ng-container matColumnDef="category">
                  <th mat-header-cell *matHeaderCellDef>{{ i18n.t('category') }}</th>
                  <td mat-cell *matCellDef="let r">
                    <span class="cat-chip" [class.product]="r.category==='product'" [class.license]="r.category==='license'">
                      {{ r.category === 'product' ? i18n.t('product') : i18n.t('license') }}
                    </span>
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="cols"></tr>
                <tr mat-row *matRowDef="let row; columns: cols;"></tr>
              </table>
              @if (g.parts.length > 50) {
                <div class="more-hint">… {{ g.parts.length - 50 }} {{ i18n.t('rows') }}</div>
              }
            </div>
          </mat-expansion-panel>
        }
      </div>
    }

    <!-- ============== MANUAL 模式: 單一廠商預覽 ============== -->
    @if (mode === 'manual' && preview(); as p) {
      <div class="summary">
        <div class="stat"><span class="label">{{ i18n.t('total') }}</span><span class="num">{{ p.total }}</span></div>
        <div class="stat product"><span class="label">{{ i18n.t('product') }}</span><span class="num">{{ p.product }}</span></div>
        <div class="stat license"><span class="label">{{ i18n.t('license') }}</span><span class="num">{{ p.license }}</span></div>
        <div class="stat sheets">
          <span class="label">Sheets</span>
          <span class="chips">
            @for (s of p.sheets; track s.name) {
              <mat-chip>{{ s.name }} · {{ s.count }}</mat-chip>
            }
          </span>
        </div>
      </div>

      <div class="preview-table">
        <table mat-table [dataSource]="p.parts.slice(0, 200)">
          <ng-container matColumnDef="sku">
            <th mat-header-cell *matHeaderCellDef>{{ i18n.t('sku') }}</th>
            <td mat-cell *matCellDef="let r">
              @if (r.sku) { {{ r.sku }} }
              @else { <span class="no-sku">(no SKU)</span> }
            </td>
          </ng-container>
          <ng-container matColumnDef="description">
            <th mat-header-cell *matHeaderCellDef>{{ i18n.t('description') }}</th>
            <td mat-cell *matCellDef="let r">{{ r.description }}</td>
          </ng-container>
          <ng-container matColumnDef="category">
            <th mat-header-cell *matHeaderCellDef>{{ i18n.t('category') }}</th>
            <td mat-cell *matCellDef="let r">
              <span class="cat-chip" [class.product]="r.category==='product'" [class.license]="r.category==='license'">
                {{ r.category === 'product' ? i18n.t('product') : i18n.t('license') }}
              </span>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="cols"></tr>
          <tr mat-row *matRowDef="let row; columns: cols;"></tr>
        </table>
        @if (p.parts.length > 200) {
          <div class="more-hint">… {{ p.parts.length - 200 }} {{ i18n.t('rows') }}</div>
        }
      </div>
    }
  </mat-dialog-content>

  <mat-dialog-actions align="end">
    <button mat-button (click)="ref.close()">{{ i18n.t('cancel') }}</button>

    @if (mode === 'auto') {
      <button mat-raised-button color="primary"
              [disabled]="!autoPreview() || loading() || !canCommitAuto()"
              (click)="commitAuto()">
        <mat-icon>save</mat-icon> {{ i18n.t('importAll') }}
      </button>
    } @else {
      <button mat-raised-button color="primary"
              [disabled]="!preview() || !vendorId || loading()"
              (click)="commit()">
        <mat-icon>save</mat-icon> {{ i18n.t('commit') }}
      </button>
    }
  </mat-dialog-actions>
  `,
  styles: [`
    .mode-row { display:flex; align-items:center; gap:10px; margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid #eef0f4; }
    .mode-row .mode-label { font-size:13px; color:#5f6368; }
    .upload-row { display:flex; align-items:center; gap:12px; margin-bottom:12px; margin-top:8px; }
    .upload-row .filename { color:#5f6368; font-size:14px; }
    .spacer { flex: 1 1 auto; }

    .summary { display:flex; gap:14px; flex-wrap:wrap; margin: 12px 0; }
    .summary .stat { background:#fff; border:1px solid #e3e6ec; border-radius:8px; padding:8px 14px; min-width:110px; }
    .summary .stat .label { display:block; font-size:11px; color:#5f6368; }
    .summary .stat .num { font-size:22px; font-weight:600; color:#1a237e; }
    .summary .product .num { color:#1a237e; }
    .summary .license .num { color:#b71c1c; }
    .summary .sheets { flex: 1; }
    .summary .chips { display:flex; gap:4px; flex-wrap:wrap; margin-top:4px; }

    .groups { display:flex; flex-direction:column; gap:6px; }
    .group-panel { border:1px solid #e3e6ec; border-radius:8px !important; box-shadow:none !important; }
    .vendor-dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:8px; }
    .vendor-name { font-weight:600; color:#1a237e; margin-right:8px; }
    .vendor-code { font-size:11px; color:#5f6368; padding:1px 6px; background:#f1f3f4; border-radius:4px; margin-right:8px; }
    .badge { font-size:10px; font-weight:600; padding:2px 8px; border-radius:10px; margin-left:4px; }
    .badge.existing { background:#e8f5e9; color:#2e7d32; }
    .badge.create   { background:#fff3e0; color:#e65100; }
    .badge.unknown  { background:#fbe9e7; color:#bf360c; }

    .count { font-size:12px; color:#5f6368; margin-right:10px; }
    .mini { font-size:11px; padding:1px 6px; border-radius:4px; margin-right:4px; }
    .mini.product { background:#e8eaf6; color:#1a237e; }
    .mini.license { background:#ffebee; color:#b71c1c; }

    .assign-row { display:flex; align-items:center; gap:12px; padding:8px 0; }
    .assign-hint { font-size:12px; color:#5f6368; }

    .preview-table { max-height:38vh; overflow:auto; border:1px solid #e3e6ec; border-radius:8px; }
    .more-hint { padding:8px; text-align:center; color:#5f6368; font-size:12px; }
    .no-sku { color:#9e9e9e; font-style:italic; font-size:12px; }
    .cat-chip { padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600; }
    .cat-chip.product { background:#e8eaf6; color:#1a237e; }
    .cat-chip.license { background:#ffebee; color:#b71c1c; }
  `]
})
export class ImportDialogComponent {
  api = inject(ApiService);
  i18n = inject(I18nService);
  ref = inject(MatDialogRef<ImportDialogComponent>);
  snack = inject(MatSnackBar);

  vendors: Vendor[] = [];
  vendorId: number | null = null;
  fileName = signal<string>('');
  preview = signal<ImportPreview | null>(null);
  autoPreview = signal<ImportAutoPreview | null>(null);
  loading = signal<boolean>(false);
  picked: File | null = null;
  cols = ['sku', 'description', 'category'];
  mode: Mode = 'auto';

  constructor(@Inject(MAT_DIALOG_DATA) public data: { vendors: Vendor[]; defaultVendorId?: number }) {
    this.vendors = data.vendors;
    this.vendorId = data.defaultVendorId ?? (data.vendors[0]?.id || null);
  }

  // ---- 模式切換 ----
  onModeChange() {
    // 切換時重新解析 (若已選檔)
    if (this.picked) this.parseFile(this.picked);
  }

  // ---- 檔案 ----
  onPick(ev: Event) {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    this.picked = f;
    this.fileName.set(f.name);
    this.parseFile(f);
  }

  parseFile(f: File) {
    this.loading.set(true);
    if (this.mode === 'auto') {
      this.preview.set(null);
      this.api.previewAutoExcel(f).subscribe({
        next: (r) => { this.autoPreview.set(r); this.loading.set(false); },
        error: (e) => {
          this.loading.set(false);
          this.snack.open(e?.error?.error || 'Preview failed', 'X', { duration: 3000 });
        }
      });
    } else {
      this.autoPreview.set(null);
      this.api.previewExcel(f).subscribe({
        next: (r) => { this.preview.set(r); this.loading.set(false); },
        error: (e) => {
          this.loading.set(false);
          this.snack.open(e?.error?.error || 'Preview failed', 'X', { duration: 3000 });
        }
      });
    }
  }

  // ---- AUTO 模式 ----
  onAssignVendor(g: any) {
    // 使用者為 UNKNOWN 群組指派 vendor 後, 該群組變成可寫入
    if (g.vendor_id) {
      g.exists = true;
      g.will_create = false;
    } else {
      g.exists = false;
      g.will_create = false;
    }
  }

  canCommitAuto(): boolean {
    const ap = this.autoPreview();
    if (!ap) return false;
    // 至少要有一個群組可寫入 (exists 或 will_create)
    return ap.groups.some(g => g.exists || g.will_create);
  }

  commitAuto() {
    const ap = this.autoPreview();
    if (!ap) return;
    // 只送可寫入的群組 (UNKNOWN 未指定 vendor 的略過)
    const writable = ap.groups.filter(g => g.exists || g.will_create);
    if (writable.length === 0) {
      this.snack.open('沒有可寫入的群組', 'X', { duration: 2000 });
      return;
    }
    this.loading.set(true);
    this.api.commitAutoImport(writable).subscribe({
      next: (r) => {
        const skipped = ap.groups.length - writable.length;
        const summary = r.results.map(x =>
          `${x.vendor_code}${x.created ? '(新)' : ''}: ${x.inserted}`
        ).join('  ·  ');
        const msg = `${this.i18n.t('successImport')} · ${r.total_inserted} ${this.i18n.t('rows')} · ${summary}${skipped ? ` · 略過 ${skipped} 群組` : ''}`;
        this.snack.open(msg, 'OK', { duration: 4500 });
        this.ref.close({ ok: true, inserted: r.total_inserted });
      },
      error: (e) => {
        this.loading.set(false);
        this.snack.open(e?.error?.error || 'Commit failed', 'X', { duration: 3000 });
      }
    });
  }

  // ---- MANUAL 模式 ----
  commit() {
    if (!this.preview() || !this.vendorId) return;
    this.loading.set(true);
    this.api.commitImport(this.vendorId, this.preview()!.parts).subscribe({
      next: (r) => {
        this.snack.open(
          `${this.i18n.t('successImport')} · ${r.inserted} ${this.i18n.t('rows')} ${this.i18n.t('imported')}`,
          'OK', { duration: 3500 }
        );
        this.ref.close({ ok: true, inserted: r.inserted, vendor_id: this.vendorId });
      },
      error: (e) => {
        this.loading.set(false);
        this.snack.open(e?.error?.error || 'Commit failed', 'X', { duration: 3000 });
      }
    });
  }
}
