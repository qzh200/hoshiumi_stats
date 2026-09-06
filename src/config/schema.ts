/**
 * config/stats.yaml 的 Zod 校验 Schema
 *
 * 职责:
 *  1. 用 zod 严格校验配置文件的结构、类型、取值范围;
 *  2. 校验失败时抛出「可读的中文错误」,让 pnpm build 直接失败并给出
 *     精确到字段路径的修复提示,绝不静默忽略错误配置。
 *
 * 若在 config/stats.yaml 中新增 / 修改字段,请同步修改本文件。
 */
import { z } from 'zod';
import { LUCIDE_ICONS } from './types';

/* ------------------------------------------------------------------ */
/* 通用原子校验器                                                      */
/* ------------------------------------------------------------------ */

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, '必须是 6 位十六进制颜色,例如 #7f9df2');

const positiveInt = z
  .number()
  .int('必须是整数')
  .min(0, '不能小于 0')
  .max(86_400_000, '不能超过 24h(86_400_000ms)');

const httpUrl = z
  .string()
  .url('必须是合法的 URL,例如 https://example.com')
  .refine((v) => /^https?:\/\//.test(v), '只支持 http:// 或 https:// 链接');

const hostname = z
  .string()
  .trim()
  .min(1, '不能为空')
  .regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/,
    '必须是合法域名,例如 blog.hoshiumi.xyz',
  );

/* ------------------------------------------------------------------ */
/* Umami                                                               */
/* ------------------------------------------------------------------ */

const umamiSchema = z
  .object({
    shareId: z
      .string()
      .trim()
      .min(1, '不能为空')
      .regex(/^[A-Za-z0-9_-]+$/, 'share ID 格式不正确(应只含字母数字下划线连字符)'),
    websiteId: z
      .string()
      .uuid({ message: '必须是合法 UUID' }),
    baseUrl: httpUrl,
    shareContext: z
      .string()
      .min(1, '不能为空')
      .max(16, 'share context 过长'),
    requestTimeoutMs: positiveInt.default(12_000),
    realtimePollMs: positiveInt.default(30_000),
    statsPollMs: positiveInt.default(60_000),
  })
  .strict('存在未知字段,请检查拼写');

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */

const colorSetSchema = z
  .object({
    background: hexColor,
    primary: hexColor,
    secondary: hexColor,
    accent: hexColor,
  })
  .strict('存在未知字段,请检查拼写');

const themeSchema = z
  .object({
    light: colorSetSchema,
    dark: colorSetSchema,
  })
  .strict('存在未知字段,请检查拼写');

/* ------------------------------------------------------------------ */
/* Background（极光 / 星星 / 噪点等场景装饰, 与 hoshiumi_home 一致）   */
/* ------------------------------------------------------------------ */

const backgroundSchema = z
  .object({
    stars: z
      .object({
        enabled: z.boolean(),
        count: z.number().int('必须是整数').min(0).max(160, '星星数量过多,建议 ≤ 120'),
      })
      .strict('存在未知字段,请检查拼写'),
  })
  .strict('存在未知字段,请检查拼写');

/* ------------------------------------------------------------------ */
/* Services                                                            */
/* ------------------------------------------------------------------ */

const serviceSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1, '不能为空')
      .regex(/^[a-z0-9-]+$/, 'id 只能包含小写字母、数字、连字符'),
    name: z.string().trim().min(1, '不能为空字符串'),
    domain: hostname,
    url: httpUrl,
    desc: z.string().trim().min(1, '不能为空字符串'),
    icon: z
      .enum(LUCIDE_ICONS)
      .optional(),
    enabled: z.boolean().default(true),
    order: z.number().int('必须是整数').default(100),
  })
  .strict('存在未知字段,请检查拼写');

/* ------------------------------------------------------------------ */
/* 顶层                                                                */
/* ------------------------------------------------------------------ */

export const statsConfigSchema = z
  .object({
    umami: umamiSchema,
    theme: themeSchema,
    background: backgroundSchema,
    services: z.array(serviceSchema).min(1, '至少需要 1 个服务项'),
  })
  .strict('存在未知字段,请检查拼写')
  .superRefine((cfg, ctx) => {
    // services[].id 唯一
    const seen = new Set<string>();
    for (const svc of cfg.services) {
      if (seen.has(svc.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['services'],
          message: `存在重复的 service id:"${svc.id}",请保证 services[].id 全局唯一`,
        });
        break;
      }
      seen.add(svc.id);
    }
    // services[].domain 唯一
    const domains = new Set<string>();
    for (const svc of cfg.services) {
      if (domains.has(svc.domain)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['services'],
          message: `存在重复的 domain:"${svc.domain}"`,
        });
        break;
      }
      domains.add(svc.domain);
    }
  });

/** 由 Schema 推导出的完整配置类型 */
export type StatsConfig = z.infer<typeof statsConfigSchema>;
export type ServiceConfig = z.infer<typeof serviceSchema>;
export type UmamiConfig = z.infer<typeof umamiSchema>;
export type ThemeConfig = z.infer<typeof themeSchema>;
export type BackgroundConfig = z.infer<typeof backgroundSchema>;

/* ------------------------------------------------------------------ */
/* 错误格式化                                                          */
/* ------------------------------------------------------------------ */

function localizeMessage(issue: z.ZodIssue): string {
  const raw = issue.message;
  if (raw === 'Required') return '该项必填,但配置中缺失或为 null';
  if (raw.startsWith('Invalid enum value')) {
    const allowed = [...raw.matchAll(/'([^']+)'/g)].map((m) => m[1]!).join(' | ');
    return `不是合法的枚举值,应为:${allowed}`;
  }
  if (raw.startsWith('Invalid url')) return '不是合法的 URL';
  if (raw.startsWith('Invalid uuid')) return '不是合法的 UUID';
  return raw;
}

export function formatZodIssues(error: z.ZodError): string {
  const lines = error.issues.map((issue, index) => {
    const path = issue.path.length > 0 ? `config:${issue.path.join('.')}` : 'config';
    const input = (issue as { input?: unknown }).input;
    const value = input === undefined ? '' : JSON.stringify(input);
    return `  ${index + 1}. ${path}  →  ${localizeMessage(issue)}${value ? `(当前值:${value})` : ''}`;
  });
  return `config/stats.yaml 校验失败,共 ${error.issues.length} 个问题:\n${lines.join('\n')}`;
}
