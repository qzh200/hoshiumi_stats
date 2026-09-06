/**
 * 枚举常量集中地
 * 任何被 zod 反复使用的字面量集合都放在这里,避免硬编码散布。
 */

/** Lucide 图标名(本项目仅做展示校验,真正的 SVG 由调用方嵌入) */
export const LUCIDE_ICONS = [
  'activity',
  'book-open',
  'cloud',
  'globe',
  'home',
  'link',
  'message-circle',
  'radio',
  'rss',
  'star',
] as const;
export type LucideIcon = (typeof LUCIDE_ICONS)[number];
