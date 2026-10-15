/**
 * 嵌入集成页纯函数 helpers —— URL 构造与宿主代码片段生成。
 * 单测：embedIntegration.spec.ts（node 环境，禁 window 依赖）。
 *
 * 契约注意：runtimeBase 为空/相对（生产同域部署 studio+runtime 的形态）时，
 * embed URL 对外部宿主系统没有意义——宿主在不同域，相对路径会在宿主域上解析。
 * 因此宿主接入片段中一律要求平台运行时绝对地址，未知部分用显式占位符。
 */

import { EMBED_PROTOCOL_VERSION } from '@apaas/shared/embed';

/** 构造 embed 干净页面 URL（/embed/app/:appId/p/:slug，非 prod 环境带 ?env=）。
 *  预览/控制台内部使用；宿主片段请用 buildHostSnippet（占位符语义）。 */
export function buildEmbedUrl(
  runtimeBase: string,
  appId: string,
  slug: string,
  env?: string,
): string {
  const base = runtimeBase.replace(/\/+$/, '');
  const params = new URLSearchParams();
  if (env && env !== 'prod') params.set('env', env);
  const qs = params.toString();
  return `${base}/embed/app/${appId}/p/${slug}${qs ? `?${qs}` : ''}`;
}

export interface HostSnippetOptions {
  runtimeBase: string;
  appId: string;
  slug: string;
  env?: string;
  /** 接入形态：npm=包导入（宿主有构建工具）；script=SDK 直链 <script> 一行接入 */
  module: 'npm' | 'script';
}

/** 平台 SDK 直链地址（部署时产物随 nginx 分发：/embed-sdk/）。 */
export function buildSdkScriptUrl(runtimeBase: string): string {
  return `${resolvePlatformOrigin(runtimeBase)}/embed-sdk/embed-sdk.js`;
}

/** runtimeBase 非绝对地址（生产同域部署形态）→ 显式占位符。 */
function resolvePlatformOrigin(runtimeBase: string): string {
  return /^https?:\/\//.test(runtimeBase) ? originOf(runtimeBase) : '<平台运行时域名>';
}

/** 生成宿主侧接入代码片段（createApaasEmbed 最小可用示例）。 */
export function buildHostSnippet(options: HostSnippetOptions): string {
  const { runtimeBase, appId, slug, env, module } = options;
  const isAbsolute = /^https?:\/\//.test(runtimeBase);
  const embedUrl = isAbsolute
    ? buildEmbedUrl(runtimeBase, appId, slug, env)
    : `<平台运行时绝对地址>${buildEmbedUrl('', appId, slug, env)}`;
  const origin = isAbsolute ? originOf(runtimeBase) : '<平台运行时 origin>';

  const optionsBody = [
    `  container: document.getElementById('apaas-embed'),`,
    `  src: '${embedUrl}',`,
    `  // 用户级 JWT：由宿主后端签发/转交（勿在前端硬编码长期凭证）`,
    `  token: '<USER_JWT>',`,
    `  allowedOrigin: '${origin}',`,
    `  // 建议宿主按需设置 sandbox：`,
    `  // sandbox: 'allow-scripts allow-forms allow-same-origin allow-popups',`,
  ].join('\n');

  const events = `embed.on('ready', (p) => console.log('页面就绪', p));
embed.on('page-event', (e) => console.log('业务事件（embedEvent 动作出站）', e));
embed.on('auth-expired', () => {
  // 401：换发 token 后 embed.setToken(newToken)；iframe 内不会出现登录页
});
// 交互数据：await embed.queryData()（页面数据域）/ embed.navigate(slug) /
// embed.setContext({ context: {...} }（宿主上下文注入页面数据域）`;

  if (module === 'script') {
    return `<!-- aPaaS 嵌入 SDK（协议 v${EMBED_PROTOCOL_VERSION}）：直链引用或到控制台下载后自托管 -->
<script src="${buildSdkScriptUrl(runtimeBase)}"></script>
<script>
  const { createApaasEmbed } = window.ApaasEmbed;
  const embed = createApaasEmbed({
${optionsBody}
  });
  ${events}
</script>`;
  }

  return `import { createApaasEmbed } from '@apaas/shared/embed';

const embed = createApaasEmbed({
${optionsBody}
});

${events}`;
}

/** 从绝对 base 推导 origin（非绝对输入返回占位提示）。 */
function originOf(base: string): string {
  try {
    return new URL(base).origin;
  } catch {
    return '<平台运行时 origin>';
  }
}
