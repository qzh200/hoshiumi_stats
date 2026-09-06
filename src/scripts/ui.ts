/**
 * UI 工具:卡片状态 / 占位填充 / 错误信息
 * - 与 Astro 组件约定的 data-* 属性协同
 */

export type CardStatus = 'loading' | 'ok' | 'error' | 'empty';

/** 设置某张卡的整体状态(显示 loading / body / error) */
export function setCardStatus(
  cardName: string,
  status: CardStatus,
  errorMessage?: string,
): void {
  const card = document.querySelector<HTMLElement>(`[data-stats-card="${cardName}"]`);
  if (!card) return;
  card.setAttribute('data-stats-status', status);

  const loading = card.querySelector<HTMLElement>('[data-stats-loading-default]');
  const error = card.querySelector<HTMLElement>('[data-stats-error-default]');
  const empty = card.querySelector<HTMLElement>('[data-stats-empty-default]');

  if (loading) loading.hidden = status !== 'loading';
  if (error) {
    error.hidden = status !== 'error';
    if (status === 'error' && errorMessage) {
      const msgEl = error.querySelector<HTMLElement>('[data-error-message]');
      if (msgEl) msgEl.textContent = errorMessage;
    }
  }
  if (empty) empty.hidden = status !== 'empty';
}

/** 填充某个数据点 */
export function setStatValue(key: string, value: string | number): void {
  const els = document.querySelectorAll<HTMLElement>(`[data-stat-value="${key}"]`);
  els.forEach((el) => {
    el.textContent = String(value);
  });
}

/** 填充副标签 */
export function setStatHint(key: string, value: string): void {
  const els = document.querySelectorAll<HTMLElement>(`[data-stat-hint="${key}"]`);
  els.forEach((el) => {
    el.textContent = value;
  });
}

/** 设置"最近更新时间"显示 */
export function setLastUpdate(timestamp: number): void {
  const el = document.getElementById('last-update-time');
  if (!el) return;
  const d = new Date(timestamp);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  el.textContent = `${hh}:${mm}:${ss}`;
  el.setAttribute('data-initial', el.textContent);
}
