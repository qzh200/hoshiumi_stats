# Hoshiumi Network Observatory

> 公开的实时数据观测站,展示 Hoshiumi 全站服务的访问情况。
> 部署: <https://stats.hoshiumi.xyz>

## 特性

- **零后端**:纯静态,所有数据由浏览器直接请求 Umami Cloud Public Share API
- **零持久化**:不存任何数据,关闭页面即停止所有请求
- **零追踪**:不写 cookie,不打点,只读 Umami
- **零运维**:Cloudflare Pages 自动部署

## 技术栈

| 用途 | 选型 |
| --- | --- |
| 框架 | Astro 4 (static output) |
| 类型 | TypeScript 5 (strict) |
| 样式 | Tailwind CSS 3 + 极光 / 玻璃质感主题 |
| 可视化 | ECharts 6(tree-shaken) |
| 部署 | Cloudflare Pages |

## 数据源

Umami Cloud 公开 share 接口(只读、不可写):

- 初始化: `GET https://cloud.umami.is/analytics/us/api/share/yuYHKpwZACgZEQ2g`
- 实时: `GET .../api/realtime/{websiteId}` (近 30 分钟)
- 概览: `GET .../api/websites/{websiteId}/stats`
- 趋势: `GET .../api/websites/{websiteId}/pageviews?unit=hour`
- 维度: `GET .../api/websites/{websiteId}/metrics?type=hostname`

所有非 init 请求需带:

```http
x-umami-share-token: <token>
x-umami-share-context: 1
```

详细封装见 [`src/lib/umami/api.ts`](./src/lib/umami/api.ts)。

## 本地开发

```bash
pnpm install
pnpm dev      # http://localhost:4321
pnpm build    # → dist/
pnpm preview  # 本地预览构建产物
```

## 部署到 Cloudflare Pages

### 方式 A:Git 集成(推荐)

1. Push 到 GitHub
2. Cloudflare Dashboard → Pages → Connect to Git
3. 配置:
   - **Build command**: `pnpm build`
   - **Build output directory**: `dist`
   - **Environment variables**: 无需 secrets(share token 公开)
   - **Node version**: `20` 或更新(在环境变量 `NODE_VERSION=20` 设置)

### 方式 B:Wrangler CLI

```bash
pnpm build
npx wrangler pages deploy dist --project-name hoshiumi-stats
```

## 项目结构

```
src/
├── components/
│   ├── common/        # Loading, ErrorState
│   ├── layout/        # Header, Footer
│   └── stats/         # StatCard, RealtimeCard, HostnameList, TrendChart, ServiceCard
├── layouts/Layout.astro
├── pages/index.astro
├── lib/umami/         # API 封装、类型、配置
├── scripts/           # 客户端模块(realtime / chart / bootstrap)
├── styles/global.css
└── utils/format.ts
```

## 性能与体验

- 首屏 SSR 渲染所有骨架(无白屏、无 layout shift)
- 客户端请求串行/并发由各模块独立管理,互不阻塞
- 页面 `hidden` 时全部定时器自动暂停;`visible` 时立即拉一次
- 失败时指数退避(最大 60s),成功后立即恢复正常间隔
- 同 key 的并发请求自动去重(API 层 inflight 缓存)
- `prefers-reduced-motion: reduce` 关闭所有动效
- `prefers-color-scheme: dark` 自动切换深色主题

## 视觉一致性

本站主题色、字体、极光背景、毛玻璃卡片与 hoshiumi.xyz 主站保持一致:

```
primary  = #7f9df2
accent   = #9d92ec
secondary = #f0a9cc
bg       = #f4f6fe / #1c2145
```

## License

MIT
