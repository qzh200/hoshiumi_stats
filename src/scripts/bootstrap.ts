/**
 * 总入口
 * - 启动 4 个独立模块(实时 / 今日 / 域名 / 趋势)
 * - 处理页面可见性:hidden 暂停,visible 立即刷新
 * - 委托重试按钮事件
 * - 每次成功 fetch 后更新 last-update 时间
 */

import { getStats, getMetrics, todayWindow, lastHoursWindow } from '~/lib/umami/api';
import { formatInt, formatAvgTime, formatTime } from '~/utils/format';
import { setCardStatus, setStatValue, setStatHint, setLastUpdate } from './ui';
import { startRealtime, pauseRealtime } from './realtime';

// ECharts bundle is ~500KB, 懒加载避免首屏阻塞
type TrendModule = typeof import('./chart');
let trendModule: TrendModule | null = null;
let trendRequested = false;

async function loadTrend(): Promise<TrendModule> {
  if (trendModule) return trendModule;
  trendModule = await import('./chart');
  return trendModule;
}

const STATS_POLL_MS = 60_000;
let statsTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;

function markUpdated(): void {
  setLastUpdate(Date.now());
}

async function loadToday(): Promise<void> {
  const { startAt, endAt } = todayWindow();
  const data = await getStats(startAt, endAt);
  setStatValue('today-pageviews', formatInt(data.pageviews));
  setStatValue('today-visitors', formatInt(data.visitors));
  setStatValue('today-visits', formatInt(data.visits));
  setStatValue('today-avg-time', formatAvgTime(data.totaltime / Math.max(1, data.visits)));
  setStatValue('today-bounce-rate', data.visits > 0 ? `${((data.bounces / data.visits) * 100).toFixed(0)}%` : '—');
  // 副标签显示统计窗口
  setStatHint('today-pageviews', `今日 · 截至 ${formatTime(endAt)}`);
  setCardStatus('today', 'ok');
  markUpdated();
}

async function loadHostnames(): Promise<void> {
  // 24h 窗口更平滑
  const { startAt, endAt } = lastHoursWindow(24);
  const list = await getMetrics('hostname', startAt, endAt);

  // 排除站外 referrer / 自己的 stats 子域(避免 self-ref)
  const filtered = list.filter((m) => m.x.endsWith('hoshiumi.xyz'));

  if (filtered.length === 0) {
    setCardStatus('hostnames', 'empty');
    return;
  }

  const total = filtered.reduce((s, m) => s + m.y, 0) || 1;
  const max = Math.max(...filtered.map((m) => m.y), 1);

  filtered
    .sort((a, b) => b.y - a.y)
    .forEach((entry) => {
      const li = document.querySelector<HTMLElement>(`[data-hostname="${entry.x}"]`);
      if (!li) return;
      const valEl = li.querySelector<HTMLElement>('[data-hostname-value]');
      const fillEl = li.querySelector<HTMLElement>('[data-hostname-fill]');
      if (valEl) valEl.textContent = formatInt(entry.y);
      if (fillEl) {
        // 进度条用 max 归一化(更易看出差距),旁边额外用占比 tooltip
        const pct = Math.max(4, (entry.y / max) * 100);
        fillEl.style.width = `${pct}%`;
        fillEl.setAttribute('data-percent-of-total', `${((entry.y / total) * 100).toFixed(1)}%`);
        fillEl.title = `占总访问 ${((entry.y / total) * 100).toFixed(1)}%`;
      }
    });
  setCardStatus('hostnames', 'ok');
  markUpdated();
}

function scheduleNext(): void {
  if (stopped) return;
  statsTimer = setTimeout(async () => {
    try {
      await Promise.allSettled([loadToday(), loadHostnames()]);
    } finally {
      scheduleNext();
    }
  }, STATS_POLL_MS);
}

function bindRetry(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const btn = target.closest<HTMLElement>('[data-retry]');
    if (!btn) return;
    const id = btn.getAttribute('data-retry');
    switch (id) {
      case 'retry-realtime':
        startRealtime();
        break;
      case 'retry-trend':
        void loadTrend().then((m) => m.resumeTrend());
        break;
      case 'retry-today':
      case 'retry-today-pageviews':
      case 'retry-today-visitors':
      case 'retry-today-visits':
      case 'retry-today-avg-time':
        void loadToday().catch(() => setCardStatus('today', 'error'));
        break;
      case 'retry-hostnames':
        void loadHostnames().catch(() => setCardStatus('hostnames', 'error'));
        break;
      default:
        // 默认:重试所有
        startRealtime();
        void loadTrend().then((m) => m.resumeTrend());
        void loadToday().catch(() => setCardStatus('today', 'error'));
        void loadHostnames().catch(() => setCardStatus('hostnames', 'error'));
    }
  });
}

async function pauseTrendSafe(): Promise<void> {
  if (!trendModule) return;
  trendModule.pauseTrend();
}

async function resumeTrendSafe(): Promise<void> {
  const m = await loadTrend();
  m.resumeTrend();
}

async function disposeTrendSafe(): Promise<void> {
  if (!trendModule) return;
  trendModule.disposeTrend();
}

function setupVisibility(): void {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseRealtime();
      void pauseTrendSafe();
      if (statsTimer) {
        clearTimeout(statsTimer);
        statsTimer = null;
      }
    } else {
      // 立即重拉
      startRealtime();
      void resumeTrendSafe();
      void loadToday().catch(() => setCardStatus('today', 'error'));
      void loadHostnames().catch(() => setCardStatus('hostnames', 'error'));
      scheduleNext();
    }
  });

  // 页面卸载时清理(关闭页面后不产生后台请求)
  window.addEventListener('pagehide', () => {
    pauseRealtime();
    void disposeTrendSafe();
    if (statsTimer) {
      clearTimeout(statsTimer);
      statsTimer = null;
    }
  });
}

function setupInitial(): void {
  // 默认所有 stat 卡片显示 loading(SSR 已渲染);此处只绑定全局事件
  bindRetry();
  setupVisibility();
}

async function bootstrap(): Promise<void> {
  if (typeof window === 'undefined') return;
  setupInitial();

  // 启动三个轻量模块(实时 / 今日 / 域名),ECharts 懒加载
  startRealtime();
  void loadToday().catch((err) => {
    setCardStatus('today', 'error', (err as Error)?.message);
  });
  void loadHostnames().catch((err) => {
    setCardStatus('hostnames', 'error', (err as Error)?.message);
  });
  scheduleNext();

  // ECharts 通过 IntersectionObserver 懒加载,首次进入视口才下载
  scheduleTrendLazyLoad();
}

/** 当 trend 卡片进入视口时,才加载 ECharts bundle */
function scheduleTrendLazyLoad(): void {
  const target = document.querySelector('[data-stats-card="trend"]');
  if (!target) return;
  if (typeof IntersectionObserver === 'undefined') {
    // 旧浏览器:直接加载
    trendRequested = true;
    void loadTrend().then((m) => m.attachTrendPolling());
    return;
  }
  const io = new IntersectionObserver(
    async (entries) => {
      if (trendRequested) return;
      if (entries.some((e) => e.isIntersecting)) {
        trendRequested = true;
        io.disconnect();
        const m = await loadTrend();
        m.attachTrendPolling();
      }
    },
    { rootMargin: '200px' },
  );
  io.observe(target);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}

// 暴露给 dev / 测试用
declare global {
  interface Window {
    __hoshiumiStats?: {
      dispose: () => void;
    };
  }
}
window.__hoshiumiStats = {
  dispose: () => {
    stopped = true;
    pauseRealtime();
    void disposeTrendSafe();
    if (statsTimer) {
      clearTimeout(statsTimer);
      statsTimer = null;
    }
  },
};
