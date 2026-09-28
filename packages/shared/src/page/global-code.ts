/**
 * 页面全局代码注入 — 对齐飞书「全局代码」：
 * globalCss 注入 <style>，globalJs 在页面挂载后执行一次。
 * 多语文案存于 schema.i18n（locale → key → 文案），提供 t() 取词。
 */

/**
 * 结构化最小参数：只关心全局代码/多语字段。
 * 不直接使用 PageSchema（其 PageType 为枚举，与各包镜像的字符串联合不互赋）。
 */
export interface GlobalCodeSchema {
  globalCss?: string;
  globalJs?: string;
  i18n?: {
    defaultLocale?: string;
    locales: Record<string, Record<string, string>>;
  };
}

const STYLE_ID = 'apaas-page-global-style';

/** 注入/更新页面全局 CSS（幂等：复用同一 <style> 节点）。 */
export function applyGlobalCss(schema: GlobalCodeSchema | null | undefined): void {
  if (typeof document === 'undefined') return;
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  const css = schema?.globalCss?.trim();
  if (!css) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = css;
}

/** 执行页面全局 JS（每次调用执行一次；调用方控制在挂载时机）。 */
export function runGlobalJs(schema: GlobalCodeSchema | null | undefined): void {
  const code = schema?.globalJs?.trim();
  if (!code) return;
  try {
    // 全局代码由搭建者编写（信任模型同 run_script），严格模式独立作用域执行
    new Function(`"use strict";\n${code}`)();
  } catch (err) {
    console.error('[GlobalCode] 执行失败:', err);
  }
}

/** 取多语文案：locale 下无对应 key 时回退默认 locale，再回退 key 本身。 */
export function translate(
  schema: GlobalCodeSchema | null | undefined,
  locale: string,
  key: string,
): string {
  const i18n = schema?.i18n;
  if (!i18n) return key;
  return (
    i18n.locales[locale]?.[key] ??
    (i18n.defaultLocale ? i18n.locales[i18n.defaultLocale]?.[key] : undefined) ??
    key
  );
}
