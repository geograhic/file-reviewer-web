# 迁移分析清单（智能文件复习系统 2.0 Web）

## 1. 依赖扫描（reviewer-web/ 内）
- [x] `require('electron')` / `import ... from 'electron'` —— 无
- [x] Node 核心 `fs` `path` `child_process` `os` `http` `crypto` —— 无（grep 零命中）
- [x] Electron API `BrowserWindow` `app.` `ipcMain` `ipcRenderer` `dialog` `Menu` `shell` —— 无
- [x] `process.env` / `process.platform` / `__dirname` / `__filename` —— 无
- [x] 本地 `<script src="vendor/...">` 全局库 —— 无（`db.js`/`scheduler.js`/`api.js` 均为自包含 IIFE，零外部依赖）
- [x] 真实文件读写 → 已改为 `<input type=file>` / File System Access API / Blob 下载

## 2. 结论
| 文件 | 依赖 Electron/Node? | 处理 |
|------|---------------------|------|
| index.html | 否 | 保留，资源改相对路径 `./` |
| app.js | 否 | 前端 SPA，仅新增 `LocalAPI.install()` 启动钩子（fetch 补丁） |
| db.js | 否 | 自包含数据层：浏览器 IndexedDB / Node 内存 Map（无外部依赖） |
| scheduler.js | 否 | 自包含：FSRS-Lite / SM-2 / Fixed 算法 1:1 移植自 app.py |
| api.js | 否 | 自包含：本地路由器 + fetch 补丁，零网络请求 |
| style.css / locales/ | 否 | 保留 |

## 3. 改造点（与桌面版 app.py 的关键差异）
- **后端**：Python `http.server` + SQLite → 浏览器内 `api.js` 路由器 + IndexedDB（无服务器、无函数计算）
- **文件扫描**：`os.walk` 全盘 → 仅用户手动选择的文件夹/文件
- **打开文件**：`os.startfile` → File System Access 句柄（Chromium）按需读原文件 / 本会话 File 引用 / 重新选择
- **索引优先**：默认只存元数据，**不存文件字节**，与桌面版「只索引、不移动原始资料」一致
- **存储**：无 `serverless` / `/api` 后端目录，`vercel.json` 无 `functions` 配置

## 4. 验证
- [x] `scheduler.test.cjs` 24/24（算法与 app.py 交叉校验）
- [x] `api.test.cjs` 14/14（后端集成：导入/复习/笔记/链接/牌组/导出/社交）
- [x] `boot.test.cjs` BOOT PASS（jsdom 无头启动 init→渲染）
- [x] 静态服务冒烟：`/`、`/index.html`、`/style.css`、`/app.js`、`/db.js`、`/scheduler.js`、`/api.js` 均 200
- [x] `index.html` 资源均为相对路径 `./`（子路径部署安全）
- [x] 导入项断言：`content/content_type/file_handle` 均为 null（零字节入库）
- [ ] Vercel 根域名样式正常（部署后人工确认）
- [ ] `apps.endril.com/reviewer/` 正常（部署后人工确认）
- [ ] `apps.endril.com/reviewer` 自动跳转正常（Worker 308）
