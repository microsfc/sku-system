// ============================================================
//  I18nService — 中英雙語切換
//  使用 Angular Signal, component 透過 i18n.t('key') 取字串
//  字典 DICT 集中管理所有可翻譯字串
// ============================================================
import { Injectable, signal } from '@angular/core';

type Lang = 'zh' | 'en';

const DICT: Record<string, { zh: string; en: string }> = {
  appTitle:        { zh: 'IT 料號管理系統',         en: 'IT Parts Management' },
  subtitle:        { zh: '產品 / 授權 料號查詢',     en: 'Product / License Lookup' },
  search:          { zh: '搜尋料號或說明',          en: 'Search SKU or Description' },
  searchAll:       { zh: '全廠商搜尋',              en: 'Search All Vendors' },
  vendors:         { zh: '代理廠商',                en: 'Vendors' },
  addVendor:       { zh: '新增廠商',                en: 'Add Vendor' },
  importExcel:     { zh: '匯入 Excel',              en: 'Import Excel' },
  importNewVendor: { zh: '匯入新廠商 Excel',         en: 'Import New Vendor' },
  total:           { zh: '料號總數',                en: 'Total' },
  product:         { zh: '產品料號',                en: 'Product' },
  license:         { zh: '授權料號',                en: 'License' },
  category:        { zh: '分類',                    en: 'Category' },
  sku:             { zh: '料號',                    en: 'SKU' },
  description:     { zh: '說明',                    en: 'Description' },
  source:          { zh: '來源檔',                  en: 'Source File' },
  updated:         { zh: '更新時間',                en: 'Updated' },
  actions:         { zh: '操作',                    en: 'Actions' },
  edit:            { zh: '編輯',                    en: 'Edit' },
  delete:          { zh: '刪除',                    en: 'Delete' },
  cancel:          { zh: '取消',                    en: 'Cancel' },
  save:            { zh: '儲存',                    en: 'Save' },
  confirm:         { zh: '確認',                    en: 'Confirm' },
  preview:         { zh: '預覽',                    en: 'Preview' },
  commit:          { zh: '寫入資料庫',              en: 'Commit to DB' },
  selectFile:      { zh: '選擇 Excel 檔',           en: 'Choose Excel File' },
  vendorCode:      { zh: '廠商代碼 (英文簡稱)',     en: 'Vendor Code' },
  vendorName:      { zh: '廠商中文名',              en: 'Vendor Name (Chinese)' },
  vendorNameEn:    { zh: '廠商英文名',              en: 'Vendor Name (English)' },
  vendorColor:     { zh: 'Tab 顏色',                en: 'Tab Color' },
  all:             { zh: '全部',                    en: 'All' },
  newPart:         { zh: '新增料號',                en: 'Add Part' },
  rows:            { zh: '筆',                      en: 'rows' },
  imported:        { zh: '已匯入',                  en: 'imported' },
  successImport:   { zh: '匯入成功',                en: 'Import successful' },
  noData:          { zh: '查無資料',                en: 'No data' },
  langSwitch:      { zh: 'EN',                      en: '中' },

  // 匯入模式
  importMode:      { zh: '匯入模式',                en: 'Import Mode' },
  modeAuto:        { zh: '自動辨識廠商',            en: 'Auto-detect Vendor' },
  modeManual:      { zh: '手動指定廠商',            en: 'Manual Vendor' },
  detected:        { zh: '已偵測',                  en: 'Detected' },
  willCreateVendor:{ zh: '將自動建立廠商',          en: 'will be created' },
  existingVendor:  { zh: '已存在廠商',              en: 'existing' },
  unknownVendor:   { zh: '未識別',                  en: 'Unknown' },
  pickVendor:      { zh: '指定廠商',                en: 'Assign Vendor' },
  skipGroup:       { zh: '略過',                    en: 'Skip' },
  importAll:       { zh: '全部匯入',                en: 'Import All' },

  // 產品歸類 / 匯出 / 多選
  family:          { zh: '產品線',                  en: 'Family' },
  familyAuto:      { zh: '自動',                    en: 'Auto' },
  familyLocked:    { zh: '已鎖定',                  en: 'Locked' },
  unclassified:    { zh: '未分類',                  en: 'Unclassified' },
  groupByFamily:   { zh: '依產品線分組',            en: 'Group by Family' },
  flatView:        { zh: '平面檢視',                en: 'Flat View' },
  classifyAll:     { zh: '一鍵分類全部',            en: 'Classify All' },
  classifyVendor:  { zh: '分類本廠商',              en: 'Classify Vendor' },
  classifyDone:    { zh: '分類完成',                en: 'Classification done' },
  exportSelected:  { zh: '匯出選取',                en: 'Export Selected' },
  exportAll:       { zh: '匯出全部',                en: 'Export Filtered' },
  selectAll:       { zh: '全選',                    en: 'Select All' },
  clearSelection:  { zh: '清除選取',                en: 'Clear Selection' },
  selected:        { zh: '已選',                    en: 'selected' },
  batchDelete:     { zh: '批次刪除',                en: 'Batch Delete' },
  confirmBatchDel: { zh: '將刪除選取的料號, 是否繼續?', en: 'Delete the selected items?' }
};

@Injectable({ providedIn: 'root' })
export class I18nService {
  lang = signal<Lang>('zh');

  toggle() { this.lang.set(this.lang() === 'zh' ? 'en' : 'zh'); }
  t(key: keyof typeof DICT): string { return DICT[key]?.[this.lang()] ?? String(key); }
}
