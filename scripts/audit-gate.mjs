#!/usr/bin/env node
/**
 * 依赖审计闸（P1-27，对抗审查 R1-engineering-05）——critical 阻断策略。
 *
 * 用法：node scripts/audit-gate.mjs <audit.json> <baseline.json>
 *   audit.json   = `pnpm audit --audit-level critical --json` 的输出
 *   baseline.json = .github/audit-baseline.json（已知 critical 豁免清单，条目带链路归因）
 *
 * 策略：
 *   - 当前通告中存在【基线之外】的 critical GHSA → 退出 1，阻断 CI（新 critical 必须显式入基线评审）；
 *   - 基线中已消失的条目 → 打印提示（应修剪基线，不阻断）；
 *   - pnpm 9 的 --audit-level 不影响 --json 全量输出，脚本内按 severity==='critical' 精筛。
 *
 * 基线条目的 chain 归因即 P2-devil-04（amis fork 决策）联动工件：
 *   chain=amis  → 随 fork/迁移决策统一处置；chain=prod → 待升级 PR 合入后修剪；
 *   chain=dev   → 纯开发工具链，随 devDeps 升级移除。
 */

import { readFileSync } from 'node:fs';

const [auditPath, baselinePath] = process.argv.slice(2);
if (!auditPath || !baselinePath) {
  console.error('用法: node scripts/audit-gate.mjs <audit.json> <baseline.json>');
  process.exit(2);
}

const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));

// fail-closed：审计 JSON 缺少预期的顶层结构（pnpm 输出格式变更/采集步骤失败产出空文件）
// 时不能静默当作「零通告」放行——退出 2 让 CI 显式红，人工确认输出形态。
if (!audit || typeof audit !== 'object' || !('advisories' in audit)) {
  console.error(
    '[audit-gate] 阻断：审计 JSON 缺少 advisories 顶层结构（pnpm 输出格式变更或采集失败），拒绝 fail-open 判定。',
  );
  process.exit(2);
}

/** 当前通告中的 critical：GHSA → { module, samplePath }。 */
const current = new Map();
for (const adv of Object.values(audit.advisories ?? {})) {
  if (adv.severity !== 'critical') continue;
  const ghsa = adv.github_advisory_id;
  if (!current.has(ghsa)) {
    const paths = (adv.findings ?? []).flatMap((f) => f.paths ?? []);
    current.set(ghsa, { module: adv.module_name, samplePath: paths[0] ?? '(路径未知)' });
  }
}

const baselined = new Set((baseline.entries ?? []).map((e) => e.ghsa));
const unbaselined = [...current.entries()].filter(([ghsa]) => !baselined.has(ghsa));
const stale = (baseline.entries ?? []).filter((e) => !current.has(e.ghsa));

for (const s of stale) {
  console.warn(`[audit-gate] 基线条目已消失，请修剪: ${s.ghsa} (${s.module})`);
}

if (unbaselined.length === 0) {
  console.log(
    `[audit-gate] 通过：critical 通告 ${current.size} 条，全部在基线内（${baselined.size} 条豁免，${stale.length} 条待修剪）。`,
  );
  process.exit(0);
}

console.error(`[audit-gate] 阻断：发现 ${unbaselined.length} 条基线之外的 critical 通告：`);
for (const [ghsa, { module, samplePath }] of unbaselined) {
  console.error(`  ${ghsa}  ${module}\n    路径示例: ${samplePath}`);
}
console.error(
  '处理方式：先升级/修补；确需豁免时在 .github/audit-baseline.json 显式登记（ghsa/module/chain/reason 四字段齐全并说明理由）。',
);
process.exit(1);
