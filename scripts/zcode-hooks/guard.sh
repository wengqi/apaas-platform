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
    (r"\bgit\s+push\s+(?:\S+\s+)*(?<![\w-])(?:-f\b|--force(?:-with-lease)?\b|--no-verify)\b",
     "git push 强制推送（含 --force-with-lease）或绕过钩子 —— 红线禁止，已推送提交的修正一律追加提交，需人工执行"),
    (r"\bgit\s+push\s+(?:\S+\s+)*(?:--all\b|--mirror\b)",
     "git push --all/--mirror 会把所有分支（含半成品）一并推送 —— 红线禁止，需人工执行"),
    (r"\bgit\s+clean\b[^|;&]*-f",
     "git clean -f 强制清理未跟踪文件（可能含用户文件与生成产物）—— 需人工确认"),
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

# git 纪律（2026-10-06 红线）：amend 仅限未推送提交——改写已推送历史按红线拦截
# （机械守卫：比对 HEAD 是否已包含于 origin/<branch>；git 不可用时 fail-open）
if re.search(r"\bgit\s+commit\s+(?:--amend\b|-[-a-zA-Z]*amend)", cmd):
    try:
        import subprocess

        def git(*args: str) -> str:
            return subprocess.run(
                ["git", *args], capture_output=True, text=True, timeout=5,
            ).stdout.strip()

        branch = git("rev-parse", "--abbrev-ref", "HEAD")
        head = git("rev-parse", "HEAD")
        upstream = git("rev-parse", "--verify", "--quiet", f"origin/{branch}")
        if (
            branch
            and branch != "HEAD"
            and head
            and upstream
            and subprocess.run(
                ["git", "merge-base", "--is-ancestor", head, upstream],
                capture_output=True, text=True, timeout=5,
            ).returncode == 0
        ):
            print(
                "git commit --amend 改写已推送提交 —— 红线禁止："
                "已推送提交的修正一律追加新提交（本分支可能挂着在途 PR）"
            )
    except Exception:
        pass  # fail-open：git 不可用时不阻塞
PY
)

if [ -n "$reason" ]; then
  echo "⛔ ZCode guard 拦截: $reason" >&2
  exit 2
fi
exit 0
