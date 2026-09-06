// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

/**
 * Hoshiumi Network Observatory 构建配置
 *
 * 设计:
 *  - 纯静态:output: 'static',产出 dist/,可直接部署到 Cloudflare Pages
 *  - 配置驱动:所有可调参数(share id / website id / services 列表)放 config/stats.yaml
 *  - Tailwind 4:通过 Vite 插件集成(无需 @astrojs/tailwind)
 *  - 客户端懒加载:ECharts 在 trend 卡片进入视口时再下载,首屏不阻塞
 *  - dev 期 Umami 代理:vite plugin 接管 /api/umami/*,转给 src/server/umami-proxy.ts
 *    真实逻辑(避免 dev 期浏览器直连 cloud.umami.is 失败);prod 由
 *    functions/api/umami/[[path]].ts 接管,共用同一份 handler
 */

/**
 * dev 期 Umami 同源代理 vite plugin
 * - 拦截 /api/umami/*,把请求重写后转给 cloud.umami.is
 * - 真实 handler 在 src/server/umami-proxy.ts,prod 由 CF Pages Functions 复用
 * - 用 server.ssrLoadModule 加载 .ts 处理器(vite 内部编译 + 缓存)
 */
function umamiProxyPlugin() {
  return {
    name: 'hoshiumi:umami-proxy',
    configureServer(server) {
      // 预热,避免首请求触发 SSR 编译
      server.ssrLoadModule('/src/server/umami-proxy.ts').catch(() => {});

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/umami')) return next();

        try {
          const protocol = (req.headers['x-forwarded-proto'] || 'http').toString();
          const host = req.headers.host || `localhost:${server.config.server.port ?? 4321}`;
          const fullUrl = `${protocol}://${host}${req.url}`;

          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (v == null) continue;
            if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
            else headers.set(k, String(v));
          }
          const method = (req.method || 'GET').toUpperCase();
          // Umami share API 全部为 GET,这里不处理 body 透传(保持简单且正确)
          const fetchRequest = new Request(fullUrl, { method, headers });

          const mod = await server.ssrLoadModule('/src/server/umami-proxy.ts');
          const response = await mod.handleUmamiProxy(fetchRequest);

          res.statusCode = response.status;
          if (response.statusText) res.statusMessage = response.statusText;
          response.headers.forEach((v, k) => {
            try {
              res.setHeader(k, v);
            } catch {
              /* ignore invalid header values */
            }
          });
          if (response.body) {
            const buf = Buffer.from(await response.arrayBuffer());
            res.end(buf);
          } else {
            res.end();
          }
        } catch (err) {
          res.statusCode = 502;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          const errMsg = err instanceof Error ? err.message : String(err);
          res.end(
            JSON.stringify({
              message: `[umami-proxy] dev proxy error: ${errMsg}`,
            }),
          );
        }
      });
    },
  };
}

export default defineConfig({
  site: 'https://stats.hoshiumi.xyz',
  output: 'static',
  compressHTML: true,

  vite: {
    plugins: [umamiProxyPlugin(), tailwindcss()],
    build: {
      cssCodeSplit: false,
      chunkSizeWarningLimit: 600,
    },
  },
});
