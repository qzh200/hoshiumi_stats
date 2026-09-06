/**
 * CF Pages Functions 入口 —— Umami API 同源代理
 *
 * 路由:`/api/umami/*` → `https://cloud.umami.is/analytics/us/api/*`
 * 真实逻辑见 `src/server/umami-proxy.ts`(dev/preview 与 prod 共用一份代码)
 *
 * 为什么用 catch-all `[[path]]`:
 *   Umami share API 路径形态多样(share/<id>、realtime/<wid>、
 *   websites/<wid>/stats?... / pageviews?... / metrics?...),
 *   用单一 catch-all 覆盖最干净。
 */

import { handleUmamiProxy } from '../../../src/server/umami-proxy';

export const onRequest = async (context: { request: Request }): Promise<Response> => {
  return handleUmamiProxy(context.request);
};
