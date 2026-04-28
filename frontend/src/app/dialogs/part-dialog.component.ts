// ============================================================
//  PartDialogComponent — 新增/編輯單筆料號對話框
//   - 支援手動指定 family (產品線), 一旦使用者輸入即視為 locked
//   - locked 後續不會被 backfill / 匯入 自動覆蓋
// ============================================================
import { Component, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../services/api.service';
import { I18nService } from '../services/i18n.service';
import { Part, Vendor } from '../models';

@Component({
  selector: 'app-part-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule],
  template: `
  <h2 mat-dialog-title>
    <mat-icon style="vertical-align:middle;margin-right:8px;">{{ data.part ? 'edit' : 'add' }}</mat-icon>
    {{ data.part ? i18n.t('edit') : i18n.t('newPart') }}
  </h2>
  <mat-dialog-content style="min-width:560px;">
    <div class="grid">
      <mat-form-field appearance="outline">
        <mat-label>{{ i18n.t('vendors') }}</mat-label>
        <mat-select [(ngModel)]="form.vendor_id">
          @for (v of data.vendors; track v.id) {
            <mat-option [value]="v.id">
              <span class="dot-mini" [style.background]="v.color"></span>
              {{ v.name }} ({{ v.code }})
            </mat-option>
          }
        </mat-select>
        @if (data.part && form.vendor_id !== data.part.vendor_id) {
          <mat-hint class="warn-hint">
            <mat-icon>swap_horiz</mat-icon>
            將從 {{ originalVendorLabel }} 改為 {{ pickVendorLabel(form.vendor_id!) }}
          </mat-hint>
        }
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>{{ i18n.t('category') }}</mat-label>
        <mat-select [(ngModel)]="form.category">
          <mat-option value="product">
            <mat-icon style="vertical-align:middle;font-size:16px;width:16px;height:16px;color:#2e7d32;">memory</mat-icon>
            {{ i18n.t('product') }}
          </mat-option>
          <mat-option value="warranty">
            <mat-icon style="vertical-align:middle;font-size:16px;width:16px;height:16px;color:#ed6c02;">verified_user</mat-icon>
            {{ i18n.t('warranty') }}
          </mat-option>
          <mat-option value="license">
            <mat-icon style="vertical-align:middle;font-size:16px;width:16px;height:16px;color:#1565c0;">vpn_key</mat-icon>
            {{ i18n.t('license') }}
          </mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full">
        <mat-label>{{ i18n.t('sku') }}</mat-label>
        <input matInput [(ngModel)]="form.sku" (ngModelChange)="onSkuChange()" />
        @if (dupExisting) {
          <mat-hint class="dup-hint">
            <mat-icon>error_outline</mat-icon>
            {{ i18n.t('duplicateSku') }} ·
            <a class="dup-link" (click)="openExisting()">{{ i18n.t('editExisting') }}</a>
          </mat-hint>
        }
      </mat-form-field>

      <mat-form-field appearance="outline" class="full">
        <mat-label>{{ i18n.t('description') }}</mat-label>
        <textarea matInput rows="3" [(ngModel)]="form.description"></textarea>
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>{{ i18n.t('family') }}</mat-label>
        <input matInput [(ngModel)]="form.family"
               placeholder="e.g. PA-440, FG-100F, C9300-24T" />
        <mat-hint>{{ i18n.t('family') }} ({{ form.family_locked ? i18n.t('familyLocked') : i18n.t('familyAuto') }})</mat-hint>
      </mat-form-field>

      <div class="lock-toggle">
        <mat-checkbox [(ngModel)]="form.family_locked">
          <mat-icon style="vertical-align:middle;margin-right:4px;font-size:16px;width:16px;height:16px;">lock</mat-icon>
          {{ i18n.t('familyLocked') }}
        </mat-checkbox>
      </div>
    </div>
  </mat-dialog-content>
  <mat-dialog-actions align="end">
    <button mat-button (click)="ref.close()">{{ i18n.t('cancel') }}</button>
    <button mat-raised-button color="primary" (click)="save()" [disabled]="!form.vendor_id || (!form.sku && !form.description)">
      {{ i18n.t('save') }}
    </button>
  </mat-dialog-actions>
  `,
  styles: [`
    .grid { display:grid; grid-template-columns: 1fr 1fr; gap:12px; align-items:start; }
    .full { grid-column: 1 / span 2; }
    .lock-toggle { display:flex; align-items:center; padding-top: 10px; }
    .dot-mini { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; vertical-align: middle; }
    .warn-hint { display:inline-flex; align-items:center; gap:4px; color: #ed6c02; font-size: 11px; }
    .warn-hint mat-icon { font-size: 14px; width:14px; height:14px; }
    .dup-hint { display:inline-flex; align-items:center; gap:4px; color: #b71c1c; font-size: 11px; }
    .dup-hint mat-icon { font-size: 14px; width:14px; height:14px; }
    .dup-link { color: #1565c0; cursor: pointer; text-decoration: underline; margin-left: 4px; }
  `]
})
export class PartDialogComponent {
  api = inject(ApiService);
  i18n = inject(I18nService);
  ref = inject(MatDialogRef<PartDialogComponent>);

  form: Partial<Part> & { family_locked?: boolean } = {
    vendor_id: 0, sku: '', description: '', category: 'product',
    family: '', family_locked: false
  };
  // 用來判斷 family 是否被使用者修改過 (修改即視為手動設定 → 鎖定)
  private originalFamily: string = '';
  originalVendorLabel: string = '';
  // 重複 SKU 提示: 後端 409 回傳的 existing 物件
  dupExisting: { id: number; sku: string; description: string; vendor_code: string } | null = null;

  constructor(@Inject(MAT_DIALOG_DATA) public data: { vendors: Vendor[]; part?: Part; vendorId?: number },
              private snack: MatSnackBar) {
    if (data.part) {
      this.form = {
        ...data.part,
        family: data.part.family || '',
        family_locked: !!data.part.family_locked
      };
      this.originalFamily = data.part.family || '';
      this.originalVendorLabel = this.pickVendorLabel(data.part.vendor_id);
    } else {
      this.form.vendor_id = data.vendorId ?? data.vendors[0]?.id ?? 0;
    }
  }

  pickVendorLabel(id: number | undefined): string {
    if (!id) return '';
    const v = this.data.vendors.find(x => x.id === id);
    return v ? `${v.name} (${v.code})` : String(id);
  }

  // 使用者修改 SKU 後清除重複提示
  onSkuChange() { this.dupExisting = null; }

  // 點擊 "編輯既有料號": 關閉本對話框並回傳指令給父層開啟既有 part
  openExisting() {
    if (this.dupExisting) {
      this.ref.close({ ok: false, openExistingId: this.dupExisting.id });
    }
  }

  save() {
    const payload: any = {
      sku: this.form.sku,
      description: this.form.description,
      category: this.form.category
    };
    const newFam = (this.form.family || '').trim().toUpperCase();
    if (this.data.part) {
      // 廠商若改變, 帶上 vendor_id
      if (this.form.vendor_id && this.form.vendor_id !== this.data.part.vendor_id) {
        payload.vendor_id = this.form.vendor_id;
      }
      // 編輯: 若 family 變了 或 lock 切換, 一律送
      if (newFam !== (this.originalFamily || '').toUpperCase()) {
        payload.family = newFam;
        payload.family_locked = true;   // 改過視為手動 → 鎖
      } else if (this.form.family_locked !== !!this.data.part.family_locked) {
        payload.family_locked = !!this.form.family_locked;
      }
      this.api.updatePart(this.data.part.id, payload).subscribe({
        next: () => this.ref.close({ ok: true }),
        error: (e) => {
          this.snack.open(e?.error?.error || 'Update failed', 'OK', { duration: 3500 });
        }
      });
    } else {
      payload.vendor_id = this.form.vendor_id;
      if (newFam) { payload.family = newFam; payload.family_locked = !!this.form.family_locked; }
      this.api.createPart(payload).subscribe({
        next: () => this.ref.close({ ok: true }),
        error: (e) => {
          // 409 重複 SKU: 顯示 inline 提示 + 提供「編輯既有料號」連結, snackbar 帶完整訊息
          if (e?.status === 409 && e?.error?.code === 'DUPLICATE_SKU' && e?.error?.existing) {
            this.dupExisting = e.error.existing;
            const ex = e.error.existing;
            this.snack.open(
              `${ex.vendor_code} 已有 ${ex.sku} — ${ex.description?.slice(0, 60) || ''}`,
              this.i18n.t('editExisting'),
              { duration: 6000 }
            ).onAction().subscribe(() => this.openExisting());
            return;
          }
          this.snack.open(e?.error?.error || 'Create failed', 'OK', { duration: 3500 });
        }
      });
    }
  }
}
