# 智能文件复习系统 2.0 Web — 部署到 Vercel + apps.endril.com 子路径

纯前端静态站点（**无构建步骤、无后端**）。用户数据只存在浏览器 IndexedDB，不消耗任何云端存储与算力。
可经 `https://apps.endril.com/reviewer/` 访问，也可作为独立 Vercel 项目直接访问。

> 原始桌面版文件（`web/`、`app.py` 等）**未改动**；本目录 `reviewer-web/` 为独立 Web 部署产物。

## 一、本地预览（验证用，无需部署）
```bash
cd reviewer-web
python -m http.server 8080
# 浏览器打开 http://localhost:8080/   （必须走 HTTP，不能用 file://）
```
资源全部使用相对路径（`./style.css`、`./app.js`、`./db.js`、`./scheduler.js`、`./api.js`），
子路径部署安全。

## 二、准备 Git 仓库（本项目在百度同步盘，需先建仓库才能联动 Vercel）
Vercel 推荐从 Git 拉取。若尚未建仓库：
```bash
cd <项目根>
git init
git add reviewer-web
git commit -m "feat: 智能文件复习系统 Web 版"
git remote add origin <你的 GitHub 仓库>
git push -u origin main
```
> 操作前先 `git pull` 防止覆盖（你的习惯）。

## 三、Vercel 部署（得到 https://<项目>.vercel.app）
1. vercel.com → Add New → Project → 选择仓库。
2. **Root Directory** 设为 `reviewer-web`。
3. Framework 选 **Other / Static**（无构建），Build Command 与 Output Directory 留空
   （`vercel.json` 已设 `buildCommand: null`、`outputDirectory: "."`）。
4. Deploy → 得到 `https://<项目>.vercel.app`。之后 push 自动重新部署。

## 四、绑定 apps.endril.com 子路径（Cloudflare 反向代理）
1. 完成第三步，拿到 Vercel 地址。
2. Cloudflare → Workers & Pages → Create Worker，粘贴 `cloudflare-worker/reviewer-proxy.js`，
   把 `TARGET` 改成 `https://<项目>.vercel.app`。
3. Triggers → Routes 添加：`apps.endril.com/reviewer/*`
4. 访问 `https://apps.endril.com/reviewer/`（**带斜杠**）。

换路径名只改 Worker 的 `PREFIX` 与路由，应用侧 `./` 相对路径无需改动。

## 五、排查
| 现象 | 解决 |
|------|------|
| 有内容无样式 | `index.html` 必须用相对路径 `./style.css` / `./app.js`（已满足） |
| `apps.endril.com/reviewer` 无斜杠 404 | Worker 已对 `/reviewer` 做 308 → `/reviewer/` |
| 打开/预览失效 | 非 Chromium 浏览器刷新后需重新选择原文件（索引优先设计，非 bug） |
| Vercel 部署后空白 | 确认 Root Directory = `reviewer-web`，且无多余构建命令 |
