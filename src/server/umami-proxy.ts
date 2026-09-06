/**
 * Umami API 同源代理(共用 handler)
 *
 * 目的:让浏览器永远只 fetch 同源 `/api/umami/*`,由 server 端转发到
 * `https://cloud.umami.is/analytics/us/api/*`,从而:
 *   - dev 期绕开 FilePanel/受限浏览器"外网解析不到"的问题
 *   - prod 期通过 CF Pages Functions 在 CF edge 中转,消除 CORS 隐患,
 *     未来可加 cache / rate-limit / token 缓存
 *
 * 设计:
 *   - 接受标准 fetch `Request`,返回标准 fetch `Response`(CF Pages Functions / vite middleware 都能用)
 *   - path:  把 `/api/umami/foo/bar` → `https://cloud.umami.is/analytics/us/api/foo/bar`
 *   - headers: 透传(剔除 hop-by-hop 头)
 *   - body:   透传(GET/HEAD 不带 body)
 *   - 响应:  完整透传(状态码 / 状态文本 / headers / body)
 *   - 上游异常:归一化为 502 JSON,方便 client 报错可读
 */

const UMAMI_ORIGIN = 'https://cloud.umami.is/analytics/us';

/** 透传黑名单(hop-by-hop + CF 内部头) */
const STRIPPED_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'cf-connecting-ip',
  'cf-ray',
  'cf-visitor',
  'cf-worker',
  'cf-ew-via',
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-forwarded-host',
  'x-real-ip',
]);

/** 响应里要剔除的头(避免泄露 CF 内部信息) */
const STRIPPED_RESPONSE_HEADERS = new Set([
  'cf-ray',
  'server',
  'cf-cache-status',
  'cf-worker',
]);

/** 响应里要剔除的"传输层"头(因为我们用 node fetch 拉 upstream,
 *  body 已经被 fetch 解压/重组;再透传 content-encoding/length 会让下游
 *  二次解压/误判长度,导致 "Failed to fetch" / body 截断) */
const STRIPPED_TRANSFER_HEADERS = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
]);

export async function handleUmamiProxy(request: Request): Promise<Response> {
  const url = new URL(request.url);
  // 客户端 fetch /api/umami/<x> → upstream /<x>
  // 例如 /api/umami/api/share/xxx → cloud.umami.is/analytics/us/api/share/xxx
  // /api/umami/realtime/xxx → cloud.umami.is/analytics/us/realtime/xxx
  // 因为 /api/umami 后的那段 path 已经是 upstream 的完整 API 路径
  const path = url.pathname.replace(/^\/api\/umami\/?/, '');
  const target = `${UMAMI_ORIGIN}/${path}${url.search}`;

  // 构造上游请求头
  const headers = new Headers();
  for (const [k, v] of request.headers.entries()) {
    if (STRIPPED_REQUEST_HEADERS.has(k.toLowerCase())) continue;
    headers.set(k, v);
  }

  // 构造上游请求 init
  const method = request.method.toUpperCase();
  const init: RequestInit = {
    method,
    headers,
  };
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = request.body;
    // @ts-expect-error duplex 在 Node 18+ fetch / undici 里需要
    init.duplex = 'half';
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (err) {
    const message = `Upstream fetch failed: ${(err as Error).message || String(err)}`;
    return new Response(JSON.stringify({ message }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }

  // 透传响应,过滤敏感头 + 传输层头
  const outHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (STRIPPED_RESPONSE_HEADERS.has(lower)) return;
    if (STRIPPED_TRANSFER_HEADERS.has(lower)) return;
    outHeaders.set(key, value);
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}
