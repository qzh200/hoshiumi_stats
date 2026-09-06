/**
 * 数字 / 时间 / 时长格式化
 */

/** 千分位 + 缩写(K/M)。`null/undefined/NaN` 显示 `—` */
export function formatNumber(value: number | null | undefined, fractionDigits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value) || !Number.isFinite(value)) {
    return '—';
  }
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  if (abs >= 10_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: fractionDigits });
}

/** 整数显示 */
export function formatInt(value: number | null | undefined): string {
  return formatNumber(value, 0);
}

/** 时长(秒) → 友好字符串:`1m 23s` / `12s` / `—` */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return '—';
  }
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

/** 平均时长(秒) → `1m 23s`,与 formatDuration 一致 */
export const formatAvgTime = formatDuration;

/** 本地化时间戳(24h),空值显示 `—` */
export function formatTime(timestamp: number | null | undefined): string {
  if (!timestamp) return '—';
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/** 本地化日期 + 时间(无秒),用于 footer 标更新时间 */
export function formatDateTime(timestamp: number | null | undefined): string {
  if (!timestamp) return '—';
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** 相对时间,例如 `5s ago` / `2m ago` / `just now` */
export function formatRelative(timestamp: number | null | undefined, now = Date.now()): string {
  if (!timestamp) return '—';
  const diff = Math.max(0, now - timestamp);
  if (diff < 5_000) return '刚刚';
  if (diff < 60_000) return `${Math.floor(diff / 1_000)}s 前`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m 前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h 前`;
  return `${Math.floor(diff / 86_400_000)}d 前`;
}

/** HH:MM 字符串(无秒),用于横轴标签 */
export function formatHourLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}
