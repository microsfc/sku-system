// ============================================================
//  PartDialogComponent — 新增/編輯單筆料號對話框
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
import { ApiService } from '../services/api.service';
import { I18nService } from '../services/i18n.service';
import { Part, Vendor } from '../models';

@Component({
  selector: 'app-part-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
  <h2 mat-dialog-title>
    <mat-icon style="vertical-align:middle;margin-right:8px;">{{ data.part ? 'edit' : 'add' }}</mat-icon>
    {{ data.part ? i18n.t('edit') : i18n.t('newPart') }}
  </h2>
  <mat-dialog-content style="min-width:520px;">
    <div class="grid">
      <mat-form-field appearance="outline">
        <mat-label>{{ i18n.t('vendors') }}</mat-label>
        <mat-select [(ngModel)]="form.vendor_id" [disabled]="!!data.part">
          @for (v of data.vendors; track v.id) {
            <mat-option [value]="v.id">{{ v.name }} ({{ v.code }})</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>{{ i18n.t('category') }}</mat-label>
        <mat-select [(ngModel)]="form.category">
          <mat-option value="product">{{ i18n.t('product') }}</mat-option>
          <mat-option value="license">{{ i18n.t('license') }}</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full">
        <mat-label>{{ i18n.t('sku') }}</mat-label>
        <input matInput [(ngModel)]="form.sku" />
      </mat-form-field>

      <mat-form-field appearance="outline" class="full">
        <mat-label>{{ i18n.t('description') }}</mat-label>
        <textarea matInput rows="3" [(ngModel)]="form.description"></textarea>
      </mat-form-field>
    </div>
  </mat-dialog-content>
  <mat-dialog-actions align="end">
    <button mat-button (click)="ref.close()">{{ i18n.t('cancel') }}</button>
    <button mat-raised-button color="primary" (click)="save()" [disabled]="!form.sku || !form.vendor_id">
      {{ i18n.t('save') }}
    </button>
  </mat-dialog-actions>
  `,
  styles: [`
    .grid { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
    .full { grid-column: 1 / span 2; }
  `]
})
export class PartDialogComponent {
  api = inject(ApiService);
  i18n = inject(I18nService);
  ref = inject(MatDialogRef<PartDialogComponent>);

  form: Partial<Part> = { vendor_id: 0, sku: '', description: '', category: 'product' };

  constructor(@Inject(MAT_DIALOG_DATA) public data: { vendors: Vendor[]; part?: Part; vendorId?: number }) {
    if (data.part) {
      this.form = { ...data.part };
    } else {
      this.form.vendor_id = data.vendorId ?? data.vendors[0]?.id ?? 0;
    }
  }

  save() {
    if (this.data.part) {
      this.api.updatePart(this.data.part.id, this.form).subscribe(() => this.ref.close({ ok: true }));
    } else {
      this.api.createPart(this.form).subscribe(() => this.ref.close({ ok: true }));
    }
  }
}
