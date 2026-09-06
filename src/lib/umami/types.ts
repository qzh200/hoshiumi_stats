/**
 * Umami Share API 类型定义
 * 文档参考:https://docs.umami.is/docs/api/realtime
 */

/** 初始化 share 接口返回 */
export interface ShareInit {
  /** 当前 share 的 JWT token,用于后续所有请求 */
  token: string;
  /** share 关联的 websiteId(可与配置中的常量一致) */
  websiteId: string;
  /** share 名称,如 "Hoshiumi Network" */
  name?: string;
  /** 关联网站信息(可选) */
  website?: {
    id: string;
    name: string;
    domain: string;
  };
}

/** Realtime:国家 / URL / 来源的字典 */
export interface RealtimeMap {
  [key: string]: number;
}

/** Realtime:事件条目 */
export interface RealtimeEvent {
  __type: 'pageview' | 'event';
  sessionId: string;
  eventName: string;
  createdAt: string;
  browser: string;
  os: string;
  device: string;
  country: string;
  urlPath: string;
  referrerDomain: string;
}

/** Realtime:时间序列点 */
export interface RealtimeSeriesPoint {
  x: string;
  y: number;
}

/** Realtime:时间序列 */
export interface RealtimeSeries {
  views: RealtimeSeriesPoint[];
  visitors: RealtimeSeriesPoint[];
}

/** Realtime 接口完整响应 */
export interface RealtimeResponse {
  countries: RealtimeMap;
  urls: RealtimeMap;
  referrers: RealtimeMap;
  events: RealtimeEvent[];
  series: RealtimeSeries;
  totals: {
    views: number;
    visitors: number;
    events: number;
    countries: number;
  };
  /** 服务端时间戳(毫秒) */
  timestamp: number;
}

/** /stats 汇总响应 */
export interface StatsResponse {
  pageviews: number;
  visitors: number;
  visits: number;
  bounces: number;
  totaltime: number;
  /** v3 中可能带变化百分比 */
  pageviewsChange?: number;
  visitorsChange?: number;
  visitsChange?: number;
  bouncesChange?: number;
  totaltimeChange?: number;
}

/** /pageviews 时间序列点 */
export interface PageviewsPoint {
  /** ISO 时间字符串,如 "2025-10-21T23:00:00Z" */
  x: string;
  y: number;
}

/** /pageviews 时间序列响应 */
export interface PageviewsResponse {
  pageviews: PageviewsPoint[];
  sessions: PageviewsPoint[];
}

/** /metrics 单条记录 */
export interface MetricsEntry {
  /** 度量项(如 hostname / path / referrer / browser / country) */
  x: string;
  y: number;
}

/** /metrics 响应 */
export type MetricsResponse = MetricsEntry[];

/** API 错误 */
export interface UmamiError {
  message: string;
  code?: string;
  status?: number;
}
