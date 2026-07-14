#!/usr/bin/env bash
# 生产部署脚本（纯前端静态站 → Vercel，可选 Cloudflare 子路径）
# 凭证只从环境变量读取，绝不写入文件/日志：
#   VERCEL_TOKEN        必填（https://vercel.com/account/tokens）
#   CLOUDFLARE_API_TOKEN 可选（仅当要走 apps.endril.com/reviewer/ 子路径）
set -euo pipefail
cd "$(dirname "$0")"   # 进入 reviewer-web

: "${VERCEL_TOKEN:?未设置 VERCEL_TOKEN，请先在环境中导出 Vercel API Token}"

echo "==> [1/2] Vercel 生产部署（reviewer-web）"
npx -y vercel deploy --prod --token "$VERCEL_TOKEN" --yes --cwd .

if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "==> [2/2] Cloudflare Worker 部署（apps.endril.com/reviewer/ 子路径）"
  echo "    提醒：请先把 cloudflare-worker/reviewer-proxy.js 里的 TARGET 改成你的 https://<项目>.vercel.app"
  cd cloudflare-worker
  npx -y wrangler deploy --token "$CLOUDFLARE_API_TOKEN"
else
  echo "（未设置 CLOUDFLARE_API_TOKEN，跳过子路径；纯 Vercel 域名已就绪）"
fi
echo "部署完成。"
