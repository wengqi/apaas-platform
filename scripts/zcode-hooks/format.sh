#!/usr/bin/env bash
# PostToolUse(Edit|Write) — 对被编辑的文件即时格式化
# 覆盖面对齐 .lintstagedrc.json：ts/tsx 走 eslint --fix + prettier --write；
# mjs/cjs/json/yml/yaml 仅 prettier --write；*.md 被 .prettierignore 排除，不格式化
# ZCode workspace hook，注册于 .zcode/config.json
# 原则：尽力而为，永远 exit 0 —— 格式化失败（含编辑中途的语法错误）不应阻塞会话
input=$(cat)
[ -z "$input" ] && exit 0

file=$(printf '%s' "$input" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    print(data.get("tool_input", {}).get("file_path", "") or "")
except Exception:
    print("")
' 2>/dev/null)

ESLINT_FIX=0
case "$file" in
  *.ts|*.tsx) ESLINT_FIX=1 ;;
  *.mjs|*.cjs|*.json|*.yml|*.yaml) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0

ROOT="${ZCODE_PROJECT_DIR:-$(git -C "$(dirname "$file")" rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$ROOT" ] && [ -x "$ROOT/node_modules/.bin/prettier" ] || exit 0

"$ROOT/node_modules/.bin/prettier" --write "$file" >/dev/null 2>&1 || true
if [ "$ESLINT_FIX" = "1" ] && [ -x "$ROOT/node_modules/.bin/eslint" ]; then
  (cd "$ROOT" && node_modules/.bin/eslint --fix "$file" >/dev/null 2>&1) || true
fi
exit 0
