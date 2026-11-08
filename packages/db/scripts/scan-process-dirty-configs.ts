/**
 * S-01 存量脏配置扫描（R-B functional 横切，◆5=A 裁决：做）——read-only。
 *
 * 扫活表流程（DRAFT + PUBLISHED 全量）的节点配置完整性，输出问题清单供人工处置。
 * 发布预检只拦未来提交；本脚本提前暴露存量脏配置（如 AUTO_REJECT 无 rejectToNodeId /
 * SCHEDULED 无 cron / condition 非法 JsonLogic），避免「重发布才爆炸」。
 *
 * 用法：cd packages/db && node scripts/scan-process-dirty-configs.ts [--json <outPath>]
 * （脚本只用可擦除类型标注，node 24 原生执行；DATABASE_URL 读 packages/db/.env）
 * 退出码：0=全部干净；1=发现脏配置；2=运行错误。
 */

import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { collectNodeIssues } from '@apaas/shared';

// 读 packages/db/.env 的 DATABASE_URL（脚本不经 dotenv 依赖，手读关键键即可）
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf-8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
}
const prisma = new PrismaClient();

interface DirtyRow {
  processDefId: string;
  apiName: string;
  name: string;
  status: string;
  appId: string;
  issues: Array<{ nodeId: string; nodeType: string; nodeTitle: string; reason: string }>;
}

async function main(): Promise<void> {
  const jsonArgIdx = process.argv.indexOf('--json');
  const outPath = jsonArgIdx >= 0 ? process.argv[jsonArgIdx + 1] : undefined;

  const defs = await prisma.processDef.findMany({
    where: { status: { in: ['DRAFT', 'PUBLISHED'] } },
    select: {
      id: true,
      apiName: true,
      name: true,
      status: true,
      appId: true,
      workflowSchema: true,
    },
    orderBy: [{ appId: 'asc' }, { apiName: 'asc' }],
  });

  const dirty: DirtyRow[] = [];
  for (const def of defs) {
    const schema = def.workflowSchema as { nodes?: unknown } | null;
    if (!schema || !Array.isArray(schema.nodes)) continue;
    const issues = collectNodeIssues(schema.nodes as Array<Record<string, unknown>>);
    if (issues.length > 0) {
      dirty.push({
        processDefId: def.id,
        apiName: def.apiName,
        name: def.name,
        status: def.status,
        appId: def.appId,
        issues,
      });
    }
  }

  if (dirty.length === 0) {
    console.log(`✅ 扫描完成：${defs.length} 个流程（DRAFT+PUBLISHED），未发现脏配置`);
    return;
  }

  console.log(`⚠️ 扫描完成：${defs.length} 个流程中发现 ${dirty.length} 个存在脏配置：\n`);
  for (const row of dirty) {
    console.log(`  [${row.status}] ${row.name} (${row.apiName}) appId=${row.appId}`);
    for (const issue of row.issues) {
      console.log(`    - 节点「${issue.nodeTitle}」(${issue.nodeType}): ${issue.reason}`);
    }
  }
  console.log('\n处置指引：脏配置在下次提交时会被发布预检打回；建议在流程编辑器中补全后重新发布。');

  if (outPath) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(outPath, JSON.stringify({ scanned: defs.length, dirty }, null, 2), 'utf-8');
    console.log(`\n清单已写入 ${outPath}`);
  }
  process.exitCode = 1;
}

main()
  .catch((err: unknown) => {
    console.error('扫描失败:', err instanceof Error ? err.message : String(err));
    process.exitCode = 2;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
