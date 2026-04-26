// ============================================================
//  ImportDialogComponent — 匯入 Excel 對話框
//  Step 1: 選擇 Excel 檔 → 後端解析 → 預覽前 200 筆
//  Step 2: 選擇要寫入的廠商 → 點 [寫入資料庫] 完成 UPSERT
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
import { MatSnackBar } from '@angular/material/snack-bar';
import { Inject } from '@angular/core';
import { ApiService } from '../services/api.service';
import { I18nService } from '../services/i18n.service';
import { ImportPreview, Vendor } from '../models';

@Component({
  selector: 'app-import-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatSelectModule, MatTableModule, MatProgressBarModule,
    MatChipsModule, MatRadioModule
  ],
  template: `
  <h2 mat-dialog-title>
    <mat-icon style="vertical-align: middle; margin-right:8px;">upload_file</mat-icon>
    {{ i18n.t('importExcel') }}
  </h2>

  <mat-dialog-content style="min-width: 720px; max-height: 70vh;">
    <div class="upload-row">
      <button mat-stroked-button color="primary" (click)="fi.click()">
        <mat-icon>folder_open</mat-icon>
        {{ i18n.t('selectFile') }}
      </button>
      <input #fi type="file" accept=".xlsx,.xls" hidden (change)="onPick($event)">
      <span class="filename">{{ fileName() || '—' }}</span>

      <span class="spacer"></span>

      <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:240px;">
        <mat-label>{{ i18n.t('vendors') }}</mat-label>
        <mat-select [(ngModel)]="vendorId">
          @for (v of vendors; track v.id) {
            <mat-option [value]="v.id">{{ v.name }} ({{ v.code }})</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </div>

    @if (loading()) {
      <mat-progress-bar mode="indeterminate"></mat-progress-bar>
    }

    @if (preview(); as p) {
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
            <td mat-cell *matCellDef="let r">{{ r.sku }}</td>
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
    <button mat-raised-button color="primary"
            [disabled]="!preview() || !vendorId || loading()"
            (click)="commit()">
      <mat-icon>save</mat-icon> {{ i18n.t('commit') }}
    </button>
  </mat-dialog-actions>
  `,
  styles: [`
    .upload-row { display:flex; align-items:center; gap:12px; margin-bottom:12px; }
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
    .preview-table { max-height:38vh; overflow:auto; border:1px solid #e3e6ec; border-radius:8px; }
    .more-hint { padding:8px; text-align:center; color:#5f6368; font-size:12px; }
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
  loading = signal<boolean>(false);
  picked: File | null = null;
  cols = ['sku', 'description', 'category'];

  constructor(@Inject(MAT_DIALOG_DATA) public data: { vendors: Vendor[]; defaultVendorId?: number }) {
    this.vendors = data.vendors;
    this.vendorId = data.defaultVendorId ?? (data.vendors[0]?.id || null);
  }

  onPick(ev: Event) {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    this.picked = f;
    this.fileName.set(f.name);
    this.loading.set(true);
    this.api.previewExcel(f).subscribe({
      next: (r) => { this.preview.set(r); this.loading.set(false); },
      error: (e) => { this.loading.set(false); this.snack.open(e?.error?.error || 'Preview failed', 'X', { duration: 3000 }); }
    });
  }

  commit() {
    if (!this.preview() || !this.vendorId) return;
    this.loading.set(true);
    this.api.commitImport(this.vendorId, this.preview()!.parts).subscribe({
      next: (r) => {
        this.snack.open(`${this.i18n.t('successImport')} · ${r.inserted} ${this.i18n.t('rows')} ${this.i18n.t('imported')}`, 'OK', { duration: 3500 });
        this.ref.close({ ok: true, inserted: r.inserted, vendor_id: this.vendorId });
      },
      error: (e) => {
        this.loading.set(false);
        this.snack.open(e?.error?.error || 'Commit failed', 'X', { duration: 3000 });
      }
    });
  }
}
