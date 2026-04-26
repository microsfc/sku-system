# IT 代理商料號管理系統 · IT Parts Management System

一套給 IT 代理商使用的「料號 / 授權」查詢與管理系統。
匯入 Excel 報價單即自動分類「產品料號」與「授權料號」，支援 Palo Alto、Fortinet、Cisco 以及自訂代理廠商。

A part-number management & lookup system for IT distributors. Import Excel quotations and the system auto-classifies SKUs as **Product** or **License**. Supports Palo Alto, Fortinet, Cisco, and any custom vendors.

## 技術 Stack
- 前端 Frontend: **Angular 17 + Angular Material 17** (standalone components, signals)
- 後端 Backend: **Node.js 22.5+ / Express** (推薦 Node 24 LTS — `node:sqlite` 已 stable)
- 資料庫 Database: **`node:sqlite` (Node.js 內建，無需 native build tools)**
- Excel 解析: SheetJS (`xlsx`)

## 一鍵啟動
```bash
# 後端
cd backend
npm install
npm start          # http://localhost:3000

# 前端
cd ../frontend
npm install
npm start          # http://localhost:4200 (proxy 至 :3000)
```

更詳細的安裝、設定、API 規格請見 `README.docx`。
For full installation, configuration and API spec see `README.docx`.

## License
MIT
