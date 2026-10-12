/**
 * 构建嵌入宿主 SDK 单文件产物（双格式）。
 *
 * 产物（dist-embed-sdk/，gitignore，随部署分发）：
 * - embed-sdk.js     IIFE：全局变量 ApaasEmbed，宿主 <script src> 一行直引
 * - embed-sdk.esm.js ESM：宿主有构建工具时 import
 *
 * 依赖理由（红线 3）：esbuild 已在依赖树中（vite 传递依赖），此处作为
 * shared 的 devDependency 显式声明，仅供本构建脚本使用，不进运行时。
 *
 * 用法：pnpm --filter @apaas/shared build:embed-sdk
 * 亦可编程调用：import { buildEmbedSdk } from './build-embed-sdk.mjs'
 */

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sharedRoot = join(scriptDir, '..');
const entry = join(sharedRoot, 'src/embed/index.ts');
const outdir = join(sharedRoot, 'dist-embed-sdk');

/** 协议版本单源：从 protocol.ts 提取（避免脚本里硬编码第二份）。 */
function readProtocolVersion() {
  const source = readFileSync(join(sharedRoot, 'src/embed/protocol.ts'), 'utf8');
  const match = source.match(/EMBED_PROTOCOL_VERSION\s*=\s*(\d+)/);
  if (!match) throw new Error('无法从 protocol.ts 提取 EMBED_PROTOCOL_VERSION');
  return match[1] ?? '';
}

/** 打包双格式产物（幂等，产物目录先清空重建）。 */
export async function buildEmbedSdk() {
  const version = readProtocolVersion();
  const banner = {
    js: `/*! aPaaS Embed SDK（iframe 嵌入宿主 SDK）| embed protocol v${version} | built ${new Date().toISOString()} | 零依赖自包含，参见平台「嵌入集成」控制台 */`,
  };
  mkdirSync(outdir, { recursive: true });
  const common = {
    entryPoints: [entry],
    bundle: true,
    minify: false,
    target: ['es2018'],
    banner,
    logLevel: 'silent',
  };
  const iifePath = join(outdir, 'embed-sdk.js');
  const esmPath = join(outdir, 'embed-sdk.esm.js');
  await build({
    ...common,
    format: 'iife',
    globalName: 'ApaasEmbed',
    outfile: iifePath,
  });
  await build({
    ...common,
    format: 'esm',
    outfile: esmPath,
  });
  return { iifePath, esmPath, version };
}

/** 产物冒烟断言（单测与 CLI 共用）：关键导出在位。 */
export function assertArtifacts(artifacts) {
  const iife = readFileSync(artifacts.iifePath, 'utf8');
  const esm = readFileSync(artifacts.esmPath, 'utf8');
  if (!iife.includes('var ApaasEmbed')) {
    throw new Error('embed-sdk.js 缺少全局命名空间 ApaasEmbed');
  }
  if (!iife.includes('createApaasEmbed')) {
    throw new Error('embed-sdk.js 缺少 createApaasEmbed');
  }
  if (!/export\s*\{[^}]*EMBED_PROTOCOL_VERSION[^}]*\}/.test(esm)) {
    throw new Error('embed-sdk.esm.js 缺少协议常量导出（版本协商用）');
  }
  if (!esm.includes('createApaasEmbed')) {
    throw new Error('embed-sdk.esm.js 缺少 createApaasEmbed');
  }
}

// CLI 直跑入口
const isCli = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  const artifacts = await buildEmbedSdk();
  assertArtifacts(artifacts);
  for (const p of [artifacts.iifePath, artifacts.esmPath]) {
    const size = readFileSync(p, 'utf8').length;
    console.log(`✅ ${p}（${(size / 1024).toFixed(1)} KB）`);
  }
}
