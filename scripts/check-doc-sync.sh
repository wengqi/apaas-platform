#!/usr/bin/env bash
#
# 文档同步检查脚本 — 在 pre-push 钩子中运行，确保关键文档与代码保持同步。
#
# 检查项：
# 1. .env.example 与 env.validation.ts 的变量名一致性
# 2. commitlint scope-enum 与 AGENTS.md scope 列表一致性
# 3. feat/fix commit 后 ROADMAP.md 是否有变更（警告，不阻断）
#
set -uo pipefail
# 不使用 set -e，避免 comm/管道命令的非零退出码导致脚本提前终止

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 颜色定义
RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

log_error() {
  echo -e "${RED}❌ $1${NC}"
  ((ERRORS++))
}

log_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
  ((WARNINGS++))
}

log_ok() {
  echo -e "${GREEN}✅ $1${NC}"
}

echo "📋 检查文档同步性..."

# ---------------------------------------------------------------------------
# 检查 1: .env.example 与 env.validation.ts 变量一致性
# ---------------------------------------------------------------------------
check_env_sync() {
  local env_example="$PROJECT_ROOT/.env.example"
  local env_validation="$PROJECT_ROOT/apps/gateway/src/config/env.validation.ts"

  if [[ ! -f "$env_example" || ! -f "$env_validation" ]]; then
    log_error "缺少 .env.example 或 env.validation.ts 文件"
    return
  fi

  # 从 env.validation.ts 提取 Joi schema 中定义的变量名（大写下划线格式）
  local joi_vars
  joi_vars=$(grep -oE '^\s+[A-Z][A-Z_]{2,}:' "$env_validation" | sed 's/^\s*//;s/://')

  # 从 .env.example 提取变量名（包括注释格式的可选变量，如 # SMTP_HOST=）
  local example_vars
  example_vars=$(grep -oE '^[# ]*[A-Z][A-Z_]{2,}=' "$env_example" | sed 's/^# *//;s/=.*//')

  # 找出在 Joi schema 中定义但 .env.example 中缺失的变量
  local missing_in_example=()
  for var in $joi_vars; do
    if ! echo "$example_vars" | grep -q "^${var}$"; then
      missing_in_example+=("$var")
    fi
  done

  if [[ ${#missing_in_example[@]} -gt 0 ]]; then
    log_error "以下变量在 env.validation.ts 中定义但 .env.example 中缺失："
    for v in "${missing_in_example[@]}"; do
      echo "    - $v"
    done
    echo "    请将缺失的变量添加到 .env.example（可选变量用注释 # 前缀）"
  else
    log_ok ".env.example 与 env.validation.ts 变量一致"
  fi
}

# ---------------------------------------------------------------------------
# 检查 2: commitlint scope-enum 与 AGENTS.md scope 列表一致性
# ---------------------------------------------------------------------------
check_scope_sync() {
  local commitlint_file="$PROJECT_ROOT/commitlint.config.mjs"
  local agents_file="$PROJECT_ROOT/AGENTS.md"

  if [[ ! -f "$commitlint_file" || ! -f "$agents_file" ]]; then
    log_error "缺少 commitlint.config.mjs 或 AGENTS.md 文件"
    return
  fi

  # 从 commitlint.config.mjs 提取 scope-enum 列表
  # 提取 scope-enum 行到下一个 ] 之间的单引号字符串
  local commitlint_scopes
  commitlint_scopes=$(sed -n "/scope-enum/,/]/p" "$commitlint_file" | grep -oE "'[a-z-]+'" | sed "s/'//g" | grep -v -e "^scope-enum$" -e "^always$" | sort -u)

  # 从 AGENTS.md 提取 scope 列表（反引号包裹的斜杠分隔列表）
  # AGENTS.md 中的 scope 行格式：scope：`gateway/shared/db/.../cloud-function`
  local agents_scopes
  agents_scopes=$(grep 'scope：' "$agents_file" | sed -n 's/.*`\([^`]*\)`.*/\1/p' | head -1 | tr '/' '\n' | sort -u)

  # 比较两个列表的差异（使用临时文件避免 SIGPIPE）
  local tmp_commitlint tmp_agents
  tmp_commitlint=$(mktemp)
  tmp_agents=$(mktemp)
  echo "$commitlint_scopes" > "$tmp_commitlint"
  echo "$agents_scopes" > "$tmp_agents"

  local diff_in_commitlint
  diff_in_commitlint=$(comm -23 "$tmp_commitlint" "$tmp_agents" 2>/dev/null || true)

  local diff_in_agents
  diff_in_agents=$(comm -13 "$tmp_commitlint" "$tmp_agents" 2>/dev/null || true)

  rm -f "$tmp_commitlint" "$tmp_agents"

  if [[ -n "$diff_in_commitlint" || -n "$diff_in_agents" ]]; then
    if [[ -n "$diff_in_commitlint" ]]; then
      log_error "以下 scope 在 commitlint.config.mjs 中存在但 AGENTS.md 中缺失："
      echo "$diff_in_commitlint" | sed 's/^/    - /'
    fi
    if [[ -n "$diff_in_agents" ]]; then
      log_error "以下 scope 在 AGENTS.md 中存在但 commitlint.config.mjs 中缺失："
      echo "$diff_in_agents" | sed 's/^/    - /'
    fi
    echo "    请同步两处的 scope 列表"
  else
    log_ok "commitlint scope-enum 与 AGENTS.md scope 列表一致"
  fi
}

# ---------------------------------------------------------------------------
# 检查 3: feat/fix commit 后 ROADMAP.md 是否有变更（警告，不阻断）
# ---------------------------------------------------------------------------
check_roadmap_update() {
  local roadmap="$PROJECT_ROOT/docs/roadmap/ROADMAP.md"

  if [[ ! -f "$roadmap" ]]; then
    log_error "缺少 ROADMAP.md 文件"
    return
  fi

  # 检查最近 3 个 commit 中是否有 feat 或 fix 类型
  local recent_feat_fix
  recent_feat_fix=$(git log --oneline -3 --grep='^feat\|^fix' 2>/dev/null | head -3)

  if [[ -z "$recent_feat_fix" ]]; then
    return # 没有 feat/fix commit，跳过检查
  fi

  # 检查最近 3 个 commit 中 ROADMAP.md 是否有变更
  local roadmap_changed
  roadmap_changed=$(git log --oneline -3 --name-only -- "docs/roadmap/ROADMAP.md" 2>/dev/null | head -1)

  if [[ -z "$roadmap_changed" ]]; then
    log_warning "最近 3 个 commit 含有 feat/fix 但 ROADMAP.md 未更新"
    echo "    如果本次变更涉及功能完成度变化，请更新 ROADMAP.md 对应 Phase 的状态"
    echo "    （此为警告，不阻断推送）"
  else
    log_ok "ROADMAP.md 已在最近 commit 中更新"
  fi
}

# ---------------------------------------------------------------------------
# 执行所有检查
# ---------------------------------------------------------------------------
check_env_sync
check_scope_sync
check_roadmap_update

# ---------------------------------------------------------------------------
# 汇总结果
# ---------------------------------------------------------------------------
echo ""
if [[ $ERRORS -gt 0 ]]; then
  echo -e "${RED}❌ 文档同步检查失败：${ERRORS} 个错误，${WARNINGS} 个警告${NC}"
  echo "   请修复上述错误后再推送（或使用 git push --no-verify 跳过检查）"
  exit 1
elif [[ $WARNINGS -gt 0 ]]; then
  echo -e "${YELLOW}⚠️  文档同步检查通过（有 ${WARNINGS} 个警告）${NC}"
  exit 0
else
  echo -e "${GREEN}✅ 文档同步检查全部通过${NC}"
  exit 0
fi
