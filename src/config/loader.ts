/**
 * 配置加载器
 *
 * 数据流:config/stats.yaml (?raw 内联) → YAML 解析 → Zod 校验 → StatsConfig
 *
 * 通过 Vite 的 `?raw` 把 YAML 文本直接打进 bundle,模块求值时完成解析
 * 与校验,全程不触碰文件系统。普通静态构建 / Astro dev / Cloudflare 适配器
 * (pre-render 工作目录会改变)中均稳定可用。
 *
 * 校验失败会在 pnpm build 启动时直接抛错,带中文精确到字段的提示。
 */
import yamlSource from '../../config/stats.yaml?raw';
import { parse as parseYaml } from 'yaml';
import { formatZodIssues, statsConfigSchema, type StatsConfig } from './schema';

let cachedConfig: StatsConfig | null = null;
let cachedError: unknown = null;

/** 读取并校验站点配置(结果缓存,各组件共享同一份配置) */
export function getStatsConfig(): StatsConfig {
  if (cachedConfig) return cachedConfig;
  if (cachedError) throw cachedError;

  try {
    const parsed: unknown = parseYaml(yamlSource);

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('[config] config/stats.yaml 内容为空或顶层不是对象(应为 map / 键值结构)。');
    }

    const result = statsConfigSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`[config] ${formatZodIssues(result.error)}`);
    }

    cachedConfig = result.data;
    return cachedConfig;
  } catch (error) {
    cachedError = error;
    throw error;
  }
}

/** 按 order 升序返回 enabled 的服务列表(给 HostnameList 使用) */
export function getEnabledServices(): StatsConfig['services'] {
  return getStatsConfig()
    .services.filter((s) => s.enabled)
    .slice()
    .sort((a, b) => a.order - b.order);
}

export type { StatsConfig, ServiceConfig } from './schema';
