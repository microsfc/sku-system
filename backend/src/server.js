// ============================================================
//  IT 代理商料號管理系統 — 後端入口
//  Backend entry — Node.js + Express + node:sqlite
// ============================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API
app.use('/api', routes);

// 健康檢查
app.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// 靜態檔代管 (Angular build 產物); 兼容 Express 4 & 5 的萬用路由語法
const distPath = path.join(__dirname, '..', '..', 'frontend', 'dist', 'parts-ui', 'browser');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'), (err) => {
      if (err) next();
    });
  });
}

app.listen(PORT, () => {
  console.log('\n+--------------------------------------------------+');
  console.log('|  IT 料號管理系統 後端啟動成功                    |');
  console.log('|  API:    http://localhost:' + PORT + '/api                |');
  console.log('|  Health: http://localhost:' + PORT + '/health             |');
  console.log('+--------------------------------------------------+\n');
});
