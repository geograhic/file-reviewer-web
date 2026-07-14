// Cloudflare Worker：将 apps.endril.com/reviewer/* 反向代理到 Vercel 部署
// 部署：Cloudflare → Workers & Pages → 粘贴本文件 → 添加路由 apps.endril.com/reviewer/*
// 应用侧已使用相对路径（./），无需随路径名改动。
const TARGET = 'https://file-reviewer-web.vercel.app'; // ← 已填真实 Vercel 地址，无需改动
const PREFIX = '/reviewer';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const { pathname } = url;

    // 无斜杠入口 → 补斜杠重定向（保证相对路径资源解析正确）
    if (pathname === PREFIX) {
      return Response.redirect(url.origin + PREFIX + '/', 308);
    }

    // 剥离前缀，转发给 Vercel
    let targetPath;
    if (pathname.startsWith(PREFIX + '/')) {
      targetPath = pathname.slice(PREFIX.length);
    } else if (pathname.startsWith(PREFIX)) {
      targetPath = '/';
    } else {
      targetPath = pathname;
    }
    if (!targetPath || targetPath === '') targetPath = '/';

    const targetUrl = TARGET + targetPath + url.search;

    // 关键：覆盖 Host 头为目标域名，否则 Vercel 会拒绝未知 Host（421/404）
    const newHeaders = new Headers(request.headers);
    newHeaders.set('host', new URL(TARGET).host);

    return fetch(targetUrl, {
      method: request.method,
      headers: newHeaders,
      body: request.body,
      redirect: 'follow',
    });
  },
};
