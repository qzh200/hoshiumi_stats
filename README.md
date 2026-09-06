# Hoshiumi 站点观测站

实时展现 Hoshiumi 全站（主站 / 博客 / 云盘 / 短链 / 状态页 等）的访问情况。
线上地址：<https://stats.hoshiumi.xyz>

> 一个不写一行后端、不存一字节数据、不打一个点、不养一台机的观测站。

## 这东西是什么

一个**纯静态**的访问数据看板。打开页面后，浏览器自己向 Umami Cloud 的公开 share 接口
发请求，把数据渲染成图表；关掉页面，所有请求立刻停止。**没有 Cookie、没有 localStorage、
没有任何服务端组件**。

适合想要"展示自家各服务被多少人用、用得怎么样"但又不想为此开一个数据库 / 后端的场景。

## 技术栈

| 用途       | 选型                              |
| ---------- | --------------------------------- |
| 框架       | Astro 4（`output: 'static'`）     |
| 类型       | TypeScript 5（strict）            |
| 样式       | Tailwind CSS 3 + 极光玻璃主题     |
| 图表       | ECharts 6（按需 tree-shake）      |
| 部署       | Cloudflare Pages                  |

## 数据源

唯一数据源：[Umami Cloud](https://cloud.umami.is) 的公开 share 接口（只读、不可写），
share token 公开，无需任何 secret。

| 用途       | 接口路径                                                  |
| ---------- | --------------------------------------------------------- |
| 初始化     | `/analytics/us/api/share/<shareId>`                       |
| 实时       | `/api/realtime/{websiteId}`（近 30 分钟）                 |
| 概览       | `/api/websites/{websiteId}/stats`                         |
| 趋势       | `/api/websites/{websiteId}/pageviews?unit=hour`           |
| 维度       | `/api/websites/{websiteId}/metrics?type=hostname`         |

除 init 外的所有请求都要带：

```http
x-umami-share-token: <token>
x-umami-share-context: 1
```

封装层在 `src/lib/umami/api.ts`。

## 本地开发

```bash
pnpm install
pnpm dev      # http://localhost:4321
pnpm build    # 产物在 dist/
pnpm preview  # 预览构建产物
```

## 部署

两条路：

**Git 集成（推荐）**：把仓库推到 GitHub，Cloudflare Pages 接 Git 即可。

| 项                     | 值               |
| ---------------------- | ---------------- |
| Build command          | `pnpm build`     |
| Build output directory | `dist`           |
| Environment variables  | 不需要           |
| Node version           | `NODE_VERSION=20` |

**Wrangler CLI**：

```bash
pnpm build
npx wrangler pages deploy dist --project-name hoshiumi-stats
```

## 代码结构

```
src/
├── components/
│   ├── common/        # Loading, ErrorState
│   ├── layout/        # Header, Footer
│   └── stats/         # StatCard, RealtimeCard, HostnameList, TrendChart, ServiceCard
├── layouts/Layout.astro
├── pages/index.astro
├── lib/umami/         # API 封装、类型、配置
├── scripts/           # 客户端模块（realtime / chart / bootstrap）
├── styles/global.css
└── utils/format.ts
```

## 体验上的细节

- **首屏无白屏**：骨架在 SSR 阶段就渲染好，避免 layout shift
- **页面切到后台**：所有定时器自动暂停；切回前台立即拉一次
- **请求失败**：指数退避，最大 60s；成功后立刻恢复正常节奏
- **同 key 并发请求**：API 层有 inflight 缓存，自动去重
- **尊重用户系统**：`prefers-reduced-motion` 关动效；`prefers-color-scheme` 切深色

## 主题色

与 hoshiumi.xyz 主站保持一致：

```
primary   = #7f9df2
accent    = #9d92ec
secondary = #f0a9cc
bg        = #f4f6fe (light) / #1c2145 (dark)
```

## 许可

MIT
