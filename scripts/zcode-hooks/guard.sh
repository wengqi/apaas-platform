#!/usr/bin/env bash
# PreToolUse(Bash) 危险命令守卫 — ZCode workspace hook，注册于 .zcode/config.json
# stdin: hook JSON（含 tool_input.command）；拦截原因写 stderr，exit 2 = deny，0 = 放行
# 原则：解析失败一律放行（fail-open）——守卫自身故障不得阻塞所有 Bash 调用
input=$(cat)
[ -z "$input" ] && exit 0

cmd=$(printf '%s' "$input" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    print(data.get("tool_input", {}).get("command", "") or "")
except Exception:
    print("")
' 2>/dev/null)
[ -z "$cmd" ] && exit 0

reason=$(python3 - "$cmd" <<'PY'
import re, sys

cmd = sys.argv[1] if len(sys.argv) > 1 else ""

# 只拦不可恢复/影响面大的操作；项目内的定向删除（如 rm -rf dist）不在列
RULES = [
    (r"\brm\s+(?:-[a-zA-Z]+\s+)*-[a-zA-Z]*[rf][a-zA-Z]*\s+(?:\S+\s+)?(?:/|~|\$HOME|\.)(?:/\*?)?(\s|$)",
     "rm 递归删除根目录/家目录/当前目录目标 —— 请人工确认后在自己的终端执行"),
    (r"\bgit\s+push\s+(?:\S+\s+)*(?<![\w-])(?:-f\b|--force(?!-with-lease)|--no-verify)\b",
     "git push 强制推送或绕过钩子 —— 红线禁止，需人工执行"),
    (r"\bgit\s+reset\s+--hard\b",
     "git reset --hard 会丢弃未提交改动 —— 用 git stash / git restore 替代"),
    (r"\bdocker\s+(?:system\s+prune|volume\s+(?:rm|prune)|compose\s+down\b[^|;&]*-v|compose\s+rm\b[^|;&]*-v)",
     "docker 删除卷/数据（含数据库数据）—— 需人工确认"),
    (r"\bdrop\s+(?:table|database|schema)\b",
     "SQL DROP 破坏性 DDL —— 需人工确认"),
    (r"\bdd\s+[^|;&]*of=/dev/", "dd 写裸设备"),
    (r"\bdiskutil\s+erase", "diskutil 抹盘"),
    (r"\bmkfs\b", "mkfs 格式化文件系统"),
]

for pat, msg in RULES:
    if re.search(pat, cmd, re.IGNORECASE):
        print(msg)
        break
PY
)

if [ -n "$reason" ]; then
  echo "⛔ ZCode guard 拦截: $reason" >&2
  exit 2
fi
exit 0
