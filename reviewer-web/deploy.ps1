# 生产部署脚本（Windows / PowerShell）
# 凭证只从环境变量读取，绝不写入文件/日志：
#   $env:VERCEL_TOKEN        必填（https://vercel.com/account/tokens）
#   $env:CLOUDFLARE_API_TOKEN 可选（仅当要走 apps.endril.com/reviewer/ 子路径）
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not $env:VERCEL_TOKEN) { throw "未设置 VERCEL_TOKEN，请先 `$env:VERCEL_TOKEN = 'xxx'` 导出 Vercel API Token" }

Write-Host "==> [1/2] Vercel 生产部署（reviewer-web）"
npx -y vercel deploy --prod --token $env:VERCEL_TOKEN --yes --cwd .

if ($env:CLOUDFLARE_API_TOKEN) {
  Write-Host "==> [2/2] Cloudflare Worker 部署（apps.endril.com/reviewer/ 子路径）"
  Write-Host "    提醒：请先把 cloudflare-worker/reviewer-proxy.js 里的 TARGET 改成你的 https://<项目>.vercel.app"
  Set-Location cloudflare-worker
  npx -y wrangler deploy --token $env:CLOUDFLARE_API_TOKEN
} else {
  Write-Host "（未设置 CLOUDFLARE_API_TOKEN，跳过子路径；纯 Vercel 域名已就绪）"
}
Write-Host "部署完成。"
