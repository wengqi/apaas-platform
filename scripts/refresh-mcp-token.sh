#!/usr/bin/env bash
# MCP token 一键续期 — 刷新 ~/.zcode/cli/config.json 中 apaas MCP server 的 JWT。
#
# 背景：MCP 客户端（ZCode 等）的 Authorization header 是静态的，accessToken
# 7 天过期后 MCP 工具全部 401。本脚本用 refreshToken（30d）换取新 token 对
# 并写回配置；refreshToken 也过期时回退为密码重新登录（密码从环境变量读，
# 不落盘）。
#
# 用法：
#   scripts/refresh-mcp-token.sh                      # 用已存 refreshToken 刷新
#   APAAS_PASSWORD=xxx scripts/refresh-mcp-token.sh --login   # 重新登录
#
# 环境变量：
#   APAAS_EMAIL      登录邮箱（默认 builder@apaas.dev，--login 用）
#   APAAS_PASSWORD   密码（--login 必须；不落盘）
#   APAAS_TENANT     租户 slug（默认 demo）
#   APAAS_MCP_CONFIG MCP 配置文件路径（默认 ~/.zcode/cli/config.json）

set -euo pipefail

GATEWAY="${APAAS_GATEWAY:-http://localhost:3000}"
CONFIG="${APAAS_MCP_CONFIG:-$HOME/.zcode/cli/config.json}"
# refreshToken 缓存（仅 refresh token 本体，权限 600；固定路径避开 $TMPDIR 差异）
mkdir -p "$HOME/.apaas"
TOKEN_FILE="${APAAS_TOKEN_FILE:-$HOME/.apaas/mcp-token.json}"

get_field() { # stdin=JSON, $1=jq 路径
  python3 -c "import sys,json; print(json.load(sys.stdin)['data']['$1'])"
}

RESP=''
if [[ "${1:-}" == "--login" ]]; then
  EMAIL="${APAAS_EMAIL:-builder@apaas.dev}"
  TENANT="${APAAS_TENANT:-demo}"
  if [[ -z "${APAAS_PASSWORD:-}" ]]; then
    echo "✗ --login 需要 APAAS_PASSWORD 环境变量（不落盘）" >&2
    exit 1
  fi
  # JSON 体由 python json.dumps 构造（凭证可含引号/反斜杠等特殊字符，shell 内插会破）
  BODY_FILE=$(mktemp); trap 'rm -f "$BODY_FILE"' EXIT
  EMAIL="$EMAIL" TENANT="$TENANT" APAAS_PASSWORD="$APAAS_PASSWORD" python3 -c '
import json, os
print(json.dumps({
    "email": os.environ["EMAIL"],
    "password": os.environ["APAAS_PASSWORD"],
    "tenantSlug": os.environ["TENANT"],
}))' > "$BODY_FILE"
  RESP=$(curl -sf -m 15 -X POST "$GATEWAY/api/v1/auth/login" \
    -H 'Content-Type: application/json' \
    --data-binary @"$BODY_FILE") || {
    echo "✗ 登录失败（检查凭证/网关地址 ${GATEWAY}）" >&2
    exit 1
  }
elif [[ -f "$TOKEN_FILE" ]]; then
  REFRESH=$(get_field refreshToken < "$TOKEN_FILE" 2>/dev/null || true)
  if [[ -n "${REFRESH:-}" ]]; then
    RESP=$(curl -sf -m 15 -X POST "$GATEWAY/api/v1/auth/refresh" \
      -H 'Content-Type: application/json' \
      -d "{\"refreshToken\":\"$REFRESH\"}") || RESP=''
  fi
fi

if [[ -z "$RESP" ]]; then
  echo "✗ 无可用 refreshToken（或已过期）。重新登录：" >&2
  echo "  APAAS_PASSWORD=xxx $0 --login" >&2
  exit 1
fi

ACCESS=$(echo "$RESP" | get_field accessToken)
echo "$RESP" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE"

python3 - "$CONFIG" "$ACCESS" <<'PYEOF'
import json, sys
config_path, token = sys.argv[1], sys.argv[2]
with open(config_path) as f:
    cfg = json.load(f)
server = cfg.get('mcp', {}).get('servers', {}).get('apaas')
if not server:
    print(f"✗ {config_path} 中未找到 mcp.servers.apaas，请先配置 MCP 接入")
    sys.exit(1)
server['headers'] = {'Authorization': f'Bearer {token}'}
with open(config_path, 'w') as f:
    json.dump(cfg, f, indent=2, ensure_ascii=False)
print(f"✓ token 已写回 {config_path}（重启会话生效）")
PYEOF
