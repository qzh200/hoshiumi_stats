/**
 * 实时面板(10 秒轮询)
 * - 首次立即拉
 * - 页面 visible:每 10s 拉
 * - 页面 hidden:停止定时器
 * - 失败:指数退避(最多 60s),恢复到正常间隔
 * - 0 在线:不算错,继续轮询
 *
 * 10s 节奏是 Umami Cloud 公共实例 rate limit 与"在线/闲置"感知的折衷点。
 */

import {
  getRealtime,
} from '~/lib/umami/api';
import { formatInt } from '~/utils/format';
import { setCardStatus, setStatValue } from './ui';

const REALTIME_POLL_MS = 10_000;
const MAX_BACKOFF_MS = 60_000;
const INITIAL_BACKOFF_MS = 10_000;

let timer: ReturnType<typeof setTimeout> | null = null;
let backoff = INITIAL_BACKOFF_MS;
let stopped = false;
let inFlight = false;

async function tick(): Promise<void> {
  if (stopped || inFlight) return;
  inFlight = true;
  try {
    const data = await getRealtime();
    const visitors = data.totals.visitors;
    setStatValue('realtime-visitors', formatInt(visitors));
    setStatValue('realtime-views', formatInt(data.totals.views));
    setStatValue('realtime-uniques', formatInt(data.totals.visitors));
    setStatValue('realtime-countries', formatInt(data.totals.countries));

    const statusText = document.getElementById('realtime-status-text');
    const dot = document.getElementById('realtime-status-dot');
    if (statusText) {
      statusText.textContent = visitors > 0 ? 'Online' : 'Idle';
    }
    if (dot) {
      dot.classList.toggle('status-dot--off', visitors === 0);
    }
    setCardStatus('realtime', 'ok');
    backoff = INITIAL_BACKOFF_MS;
  } catch (err) {
    setCardStatus('realtime', 'error', (err as Error)?.message || '请求失败');
  } finally {
    inFlight = false;
    if (!stopped) {
      timer = setTimeout(tick, backoff);
      if (backoff > REALTIME_POLL_MS) backoff = Math.min(MAX_BACKOFF_MS, backoff * 1.5);
    }
  }
}

export function startRealtime(): void {
  if (stopped) return;
  stopped = false;
  // 首次立即拉一次
  void tick();
}

export function pauseRealtime(): void {
  stopped = true;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

export function resumeRealtime(): void {
  if (!stopped) return;
  // visible 切回时:立即拉一次,无视 backoff
  backoff = INITIAL_BACKOFF_MS;
  void startRealtime();
}
