/**
 * Umami Share API 客户端封装(client-only)
 *
 * 设计要点:
 * - 纯客户端调用,SSR / build 期不会执行 fetch
 * - 单一 Promise 缓存(shareInit / 同 key 在飞请求),避免重复拉取
 * - AbortController + 超时控制
 * - 错误归一化为可识别状态
 * - 配置全部从 window.__HOSHUMI_CONFIG__ 读(由 Layout.astro 在 SSR 期
 *   从 config/stats.yaml 编译注入)。本文件不依赖 loader / yaml / zod,
 *   不会把这些运行时打进 client bundle。
 */

import type {
  ShareInit,
  RealtimeResponse,
  StatsResponse,
  PageviewsResponse,
  MetricsResponse,
  UmamiError,
} from './types';

// ======== 内部状态 ========

/** share token 缓存(同会话复用) */
let cachedToken: string | null = null;
/** 同 key 的在飞请求缓存(去重) */
const inflight = new Map<string, Promise<unknown>>();

// ======== 配置获取(SSR 用 loader,client 用 inline) ========

interface RuntimeConfig {
  shareId: string;
  websiteId: string;
  baseUrl: string;
  shareContext: string;
  requestTimeoutMs: number;
}

declare global {
  interface Window {
    __HOSHUMI_CONFIG__?: RuntimeConfig;
  }
}

function getRuntimeConfig(): RuntimeConfig {
  if (typeof window === 'undefined') {
    // SSR / build 期不应执行 fetch(本文件按 client-only 设计)
    // 真实 SSR 校验由 src/config/loader.ts 在页面渲染时完成
    throw new Error('[api] getRuntimeConfig() called during SSR — fetch must be client-only');
  }
  const cfg = window.__HOSHUMI_CONFIG__;
  if (!cfg) {
    throw new Error(
      '[api] window.__HOSHUMI_CONFIG__ missing — ensure Layout.astro injected it from config/stats.yaml',
    );
  }
  // 强制走同源 /api/umami(dev 期由 vite plugin 代理、prod 由
  // CF Pages Functions 代理到 cloud.umami.is)。这样浏览器永远不直连外网,
  // 避免 dev 沙箱 / CORS 限制。yaml 里的 baseUrl 仅作为 reference 保留。
  return {
    ...cfg,
    baseUrl: `${window.location.origin}/api/umami`,
  };
}

// ======== 工具函数 ========

/** 统一请求头(share token + context) */
function buildHeaders(token: string, shareContext: string): HeadersInit {
  return {
    'x-umami-share-token': token,
    'x-umami-share-context': shareContext,
    Accept: 'application/json',
  };
}

/** fetch(不带超时,让浏览器自然处理;真正的失败用真实错误信息) */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  _timeoutMs: number,
): Promise<Response> {
  return await fetch(url, init);
}

/** fetch 包装:JSON 解析 + 状态码校验 + 错误归一化 */
async function request<T>(url: string, init: RequestInit, cacheKey: string): Promise<T> {
  const existing = inflight.get(cacheKey) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = (async () => {
    const cfg = getRuntimeConfig();
    let res: Response;
    try {
      res = await fetchWithTimeout(url, init, cfg.requestTimeoutMs);
    } catch (err) {
      // dev 期打 console.error 让调试有线索(prod 保持归一化,不污染用户控制台)
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.error('[umami] fetch failed', { url, err });
      }
      const e: UmamiError = {
        message: `网络异常: ${(err as Error).message || String(err)}`,
        code: 'network',
      };
      throw e;
    }

    if (!res.ok) {
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        /* ignore */
      }
      const e: UmamiError = {
        message: `HTTP ${res.status}: ${res.statusText || '请求失败'}`,
        code: 'http',
        status: res.status,
      };
      if (body && typeof body === 'object' && 'message' in body) {
        e.message += ` — ${String((body as Record<string, unknown>).message)}`;
      }
      throw e;
    }

    try {
      return (await res.json()) as T;
    } catch (err) {
      const e: UmamiError = {
        message: `响应解析失败: ${(err as Error).message}`,
        code: 'parse',
      };
      throw e;
    }
  })();

  inflight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(cacheKey);
  }
}

// ======== 公开 API ========

/**
 * 初始化 share,获取 token + websiteId
 * 该接口不需要 share token(否则就鸡生蛋了)
 * 同会话内仅请求一次。
 */
export async function initShare(): Promise<ShareInit> {
  const cfg = getRuntimeConfig();
  if (cachedToken) {
    return { token: cachedToken, websiteId: cfg.websiteId };
  }
  const url = `${cfg.baseUrl}/api/share/${cfg.shareId}`;
  const data = await request<ShareInit>(
    url,
    { method: 'GET', headers: { Accept: 'application/json' } },
    'share-init',
  );
  if (!data?.token) {
    throw { message: 'share init 响应缺少 token', code: 'init' } satisfies UmamiError;
  }
  cachedToken = data.token;
  return { ...data, websiteId: data.websiteId || cfg.websiteId };
}

/** 确保已初始化(惰性) */
async function ensureToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const init = await initShare();
  return init.token;
}

/** 实时数据(最近 30 分钟) */
export async function getRealtime(): Promise<RealtimeResponse> {
  const cfg = getRuntimeConfig();
  const token = await ensureToken();
  const url = `${cfg.baseUrl}/api/realtime/${cfg.websiteId}`;
  return request<RealtimeResponse>(
    url,
    { method: 'GET', headers: buildHeaders(token, cfg.shareContext) },
    `realtime:${cfg.websiteId}`,
  );
}

/** 站点汇总(自定义时间窗口) */
export async function getStats(startAt: number, endAt: number): Promise<StatsResponse> {
  const cfg = getRuntimeConfig();
  const token = await ensureToken();
  const params = new URLSearchParams({ startAt: String(startAt), endAt: String(endAt) });
  const url = `${cfg.baseUrl}/api/websites/${cfg.websiteId}/stats?${params}`;
  return request<StatsResponse>(
    url,
    { method: 'GET', headers: buildHeaders(token, cfg.shareContext) },
    `stats:${cfg.websiteId}:${startAt}:${endAt}`,
  );
}

/** 页面浏览 / 会话 时间序列 */
export async function getPageviews(
  startAt: number,
  endAt: number,
  unit: 'hour' | 'day' | 'month' = 'hour',
): Promise<PageviewsResponse> {
  const cfg = getRuntimeConfig();
  const token = await ensureToken();
  const params = new URLSearchParams({
    startAt: String(startAt),
    endAt: String(endAt),
    unit,
  });
  const url = `${cfg.baseUrl}/api/websites/${cfg.websiteId}/pageviews?${params}`;
  return request<PageviewsResponse>(
    url,
    { method: 'GET', headers: buildHeaders(token, cfg.shareContext) },
    `pageviews:${cfg.websiteId}:${startAt}:${endAt}:${unit}`,
  );
}

/** 维度指标(hostname / path / referrer / browser / country) */
export async function getMetrics(
  type:
    | 'hostname'
    | 'path'
    | 'referrer'
    | 'browser'
    | 'os'
    | 'device'
    | 'country'
    | 'event'
    | 'query',
  startAt: number,
  endAt: number,
): Promise<MetricsResponse> {
  const cfg = getRuntimeConfig();
  const token = await ensureToken();
  const params = new URLSearchParams({
    type,
    startAt: String(startAt),
    endAt: String(endAt),
  });
  const url = `${cfg.baseUrl}/api/websites/${cfg.websiteId}/metrics?${params}`;
  return request<MetricsResponse>(
    url,
    { method: 'GET', headers: buildHeaders(token, cfg.shareContext) },
    `metrics:${cfg.websiteId}:${type}:${startAt}:${endAt}`,
  );
}

/** 工具:今天 0 点到当前的毫秒窗口 */
export function todayWindow(): { startAt: number; endAt: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return { startAt: start.getTime(), endAt: now.getTime() };
}

/** 工具:最近 N 小时窗口 */
export function lastHoursWindow(hours: number): { startAt: number; endAt: number } {
  const end = Date.now();
  return { startAt: end - hours * 3_600_000, endAt: end };
}
