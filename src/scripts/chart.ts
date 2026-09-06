/**
 * 24h 趋势折线图(ECharts)
 * - 平滑曲线 + 渐变填充,颜色与 hoshiumi 主题一致
 * - 响应式:window resize 时重绘
 * - 主题色优先读取 CSS 变量,自动适配暗色
 */

import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { getPageviews, lastHoursWindow } from '~/lib/umami/api';
import { formatInt, formatHourLabel } from '~/utils/format';
import { setCardStatus } from './ui';

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  CanvasRenderer,
]);

let chart: echarts.ECharts | null = null;
let resizeHandler: (() => void) | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;

const POLL_MS = 60_000;

function getCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function buildOption(timestamps: string[], pageviews: number[], sessions: number[]): echarts.EChartsCoreOption {
  const primary = getCssVar('--color-primary', '#7f9df2');
  const accent = getCssVar('--color-accent', '#9d92ec');
  const ink700 = getCssVar('--color-ink-700', '#3a3f6b');
  const ink500 = getCssVar('--color-ink-500', '#6b7194');
  const ink300 = getCssVar('--color-ink-300', '#aab0d4');
  const cardBorder = 'rgba(127, 157, 242, 0.18)';

  return {
    grid: { top: 16, right: 12, bottom: 28, left: 36, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.92)',
      borderColor: cardBorder,
      borderWidth: 1,
      textStyle: { color: ink700, fontSize: 12 },
      extraCssText: 'backdrop-filter: blur(12px); box-shadow: 0 8px 24px -8px rgba(127,157,242,0.25);',
      axisPointer: { lineStyle: { color: cardBorder, type: 'dashed' } },
      formatter: (params: unknown) => {
        const arr = params as Array<{ axisValueLabel: string; seriesName: string; value: number; color: string }>;
        if (!arr || arr.length === 0) return '';
        const label = arr[0].axisValueLabel;
        const rows = arr
          .map(
            (p) =>
              `<div style="display:flex;align-items:center;gap:6px;font-size:12px;margin-top:2px;">
                <span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${p.color}"></span>
                <span style="color:${ink500}">${p.seriesName}</span>
                <span style="margin-left:auto;font-weight:600;color:${ink700}">${formatInt(p.value)}</span>
              </div>`,
          )
          .join('');
        return `<div style="font-size:11px;color:${ink500};margin-bottom:4px">${label}</div>${rows}`;
      },
    },
    xAxis: {
      type: 'category',
      data: timestamps,
      boundaryGap: false,
      axisLine: { lineStyle: { color: cardBorder } },
      axisTick: { show: false },
      axisLabel: {
        color: ink500,
        fontSize: 10,
        formatter: (val: string) => formatHourLabel(val),
        interval: Math.max(1, Math.floor(timestamps.length / 8)),
      },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: cardBorder, type: 'dashed' } },
      axisLabel: {
        color: ink500,
        fontSize: 10,
        formatter: (val: number) => formatInt(val),
      },
    },
    series: [
      {
        name: 'Pageviews',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: pageviews,
        lineStyle: { width: 2.5, color: primary },
        itemStyle: { color: primary },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(127, 157, 242, 0.45)' },
            { offset: 1, color: 'rgba(127, 157, 242, 0.02)' },
          ]),
        },
        emphasis: { focus: 'series' },
        symbol: 'circle',
        symbolSize: 6,
      },
      {
        name: 'Sessions',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: sessions,
        lineStyle: { width: 2, color: accent, opacity: 0.75, type: [4, 4] },
        itemStyle: { color: accent },
        emphasis: { focus: 'series' },
      },
    ],
    textStyle: { color: ink700 },
    animationDuration: 600,
    animationEasing: 'cubicOut' as echarts.EChartsCoreOption['animationEasing'],
    _ink300: ink300,
  } as echarts.EChartsCoreOption;
}

async function refresh(): Promise<void> {
  const el = document.getElementById('trend-chart');
  if (!el) return;
  try {
    const { startAt, endAt } = lastHoursWindow(24);
    const data = await getPageviews(startAt, endAt, 'hour');
    const points = data.pageviews || [];
    const sessionPoints = data.sessions || [];

    // 防御:若返回 0 条数据,标 empty
    if (points.length === 0) {
      setCardStatus('trend', 'empty');
      return;
    }

    const timestamps = points.map((p) => p.x);
    const values = points.map((p) => p.y);
    const sessions = sessionPoints.map((p) => p.y);

    if (!chart) {
      chart = echarts.init(el, undefined, { renderer: 'canvas' });
      resizeHandler = () => chart?.resize();
      window.addEventListener('resize', resizeHandler, { passive: true });
    }
    chart.setOption(buildOption(timestamps, values, sessions), true);
    setCardStatus('trend', 'ok');
  } catch (err) {
    setCardStatus('trend', 'error', (err as Error)?.message || '趋势请求失败');
  }
}

export function startTrend(): void {
  stopped = false;
  void refresh();
}

function scheduleNext(): void {
  if (stopped) return;
  pollTimer = setTimeout(async () => {
    await refresh();
    scheduleNext();
  }, POLL_MS);
}

export function attachTrendPolling(): void {
  // 把刷新 + 轮询挂上(与 visibility 协同)
  stopped = false;
  void refresh();
  scheduleNext();
}

export function pauseTrend(): void {
  stopped = true;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

export function resumeTrend(): void {
  if (!stopped) return;
  attachTrendPolling();
}

export function disposeTrend(): void {
  pauseTrend();
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }
  if (chart) {
    chart.dispose();
    chart = null;
  }
}
