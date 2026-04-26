// ============================================================
//  VendorDialogComponent — 新增代理廠商對話框
//  選填: 同時上傳該廠商的 Excel 料號表
// ============================================================
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../services/api.service';
import { I18nService } from '../services/i18n.service';

@Component({
  selector: 'app-vendor-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatProgressBarModule, MatCheckboxModule
  ],
  template: `
  <h2 mat-dialog-title>
    <mat-icon style="vertical-align:middle;margin-right:8px;">add_business</mat-icon>
    {{ i18n.t('addVendor') }}
  </h2>

  <mat-dialog-content style="min-width:520px;">
    <div class="grid">
      <mat-form-field appearance="outline">
        <mat-label>{{ i18n.t('vendorCode') }}</mat-label>
        <input matInput [(ngModel)]="form.code" placeholder="e.g. SOPHOS" />
        <mat-hint>英文簡稱，會作為唯一識別 / Used as unique key</mat-hint>
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>{{ i18n.t('vendorName') }}</mat-label>
        <input matInput [(ngModel)]="form.name" placeholder="例如 Sophos 防火牆" />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>{{ i18n.t('vendorNameEn') }}</mat-label>
        <input matInput [(ngModel)]="form.name_en" placeholder="Sophos" />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>{{ i18n.t('vendorColor') }}</mat-label>
        <input matInput type="color" [(ngModel)]="form.color" />
      </mat-form-field>
    </div>

    <mat-checkbox [(ngModel)]="includeExcel">
      <mat-icon style="vertical-align:middle;font-size:18px;">upload_file</mat-icon>
      同時匯入 Excel 料號 / Also import an Excel file now
    </mat-checkbox>

    @if (includeExcel) {
      <div class="upload">
        <button mat-stroked-button color="primary" (click)="fi.click()">
          <mat-icon>folder_open</mat-icon> {{ i18n.t('selectFile') }}
        </button>
        <input #fi type="file" accept=".xlsx,.xls" hidden (change)="onPick($event)">
        <span class="filename">{{ fileName() || '—' }}</span>
      </div>
    }

    @if (loading()) { <mat-progress-bar mode="indeterminate"></mat-progress-bar> }
  </mat-dialog-content>

  <mat-dialog-actions align="end">
    <button mat-button (click)="ref.close()">{{ i18n.t('cancel') }}</button>
    <button mat-raised-button color="primary"
            [disabled]="!form.code || !form.name || loading() || (includeExcel && !file)"
            (click)="save()">
      <mat-icon>save</mat-icon> {{ i18n.t('save') }}
    </button>
  </mat-dialog-actions>
  `,
  styles: [`
    .grid { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
    .upload { display:flex; align-items:center; gap:10px; margin: 8px 0; }
    .upload .filename { color:#5f6368; font-size:14px; }
  `]
})
export class VendorDialogComponent {
  api = inject(ApiService);
  i18n = inject(I18nService);
  ref = inject(MatDialogRef<VendorDialogComponent>);
  snack = inject(MatSnackBar);

  form = { code: '', name: '', name_en: '', color: '#3f51b5' };
  includeExcel = false;
  file: File | null = null;
  fileName = signal('');
  loading = signal(false);

  onPick(ev: Event) {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    this.file = f;
    this.fileName.set(f.name);
  }

  save() {
    this.loading.set(true);
    if (this.includeExcel && this.file) {
      this.api.importNewVendor({ ...this.form, file: this.file }).subscribe({
        next: (r) => {
          this.snack.open(`${this.i18n.t('successImport')} · ${r.inserted} ${this.i18n.t('rows')}`, 'OK', { duration: 3500 });
          this.ref.close({ ok: true, vendor_id: r.vendor_id, inserted: r.inserted });
        },
        error: (e) => { this.loading.set(false); this.snack.open(e?.error?.error || 'Failed', 'X', { duration: 3000 }); }
      });
    } else {
      this.api.createVendor(this.form).subscribe({
        next: (r) => {
          this.snack.open('Vendor created', 'OK', { duration: 2500 });
          this.ref.close({ ok: true, vendor_id: r.id });
        },
        error: (e) => { this.loading.set(false); this.snack.open(e?.error?.error || 'Failed', 'X', { duration: 3000 }); }
      });
    }
  }
}
