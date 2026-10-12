#!/usr/bin/env bash
# 设计 token 守卫（2026-10-12 token 化轮）：两个前端的 src（ts/tsx）内禁止 hex 色值字面量。
#
# 色值一律从 @apaas/shared/design 消费（TOKENS/PRESET/BRAND/LAYOUT/LOGIN_BG/
# appTileBackground 等工具）。没有 token 体系会烂回去的根因是"无守卫"——本脚本是
# 那条守卫，机制与 check-doc-sync.sh 同款，挂在 .husky/pre-push。
#
# 豁免：
#  - 行内注释 `// design-token-allow <理由>`（须写明为什么此行必须用字面量）
#  - HTML 实体（&#123; 等 URL 展示文本，非色值）
#  - *.css 文件（无法 import TS 模块；目前仅 index.css 的 focus 描边数处，改动需同步 token 值）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

violations=$(grep -rEn '#[0-9a-fA-F]{3,8}\b' \
  "$ROOT/packages/studio/src" "$ROOT/packages/runtime-ui/src" \
  --include='*.ts' --include='*.tsx' \
  | grep -v 'design-token-allow' \
  | grep -v '&#[0-9]' \
  || true)

if [ -n "$violations" ]; then
  echo "❌ 发现硬编码色值字面量（应改从 @apaas/shared/design 消费 TOKENS/PRESET）：" >&2
  echo "$violations" >&2
  echo "" >&2
  echo "确属必须字面量的场景，在行尾加注释：// design-token-allow <理由>" >&2
  exit 1
fi

echo "✅ 设计 token 守卫通过（前端 src 零 hex 字面量）"
