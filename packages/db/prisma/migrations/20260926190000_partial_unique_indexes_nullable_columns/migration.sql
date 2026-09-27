-- 评审 A-H2：可空列上的唯一约束失效（PostgreSQL 中 NULL 互不相等）
--
-- 现有约束（org_id, role_id, app_id）与（tenant_id, email）在参与列为 NULL 时
-- 完全失去去重能力：
--   1) org_role_grants.app_id IS NULL（租户级/全局授权）同一 (org, role) 可无限重复插入
--   2) users.tenant_id IS NULL（平台超管）同一邮箱可重复创建
-- Prisma schema 无法表达 partial unique index，故在此手写迁移，
-- 保留原约束（覆盖 NOT NULL 场景），并补齐 NULL 场景的部分唯一索引。

-- 1) 清理历史重复行（保留最早一条：id 字典序最小）
DELETE FROM org_role_grants a
 USING org_role_grants b
 WHERE a.app_id IS NULL
   AND b.app_id IS NULL
   AND a.org_id = b.org_id
   AND a.role_id = b.role_id
   AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS org_role_grants_global_scope_unique
  ON org_role_grants (org_id, role_id)
  WHERE app_id IS NULL;

-- 2) 平台超管邮箱唯一（tenant_id IS NULL）
DELETE FROM users a
 USING users b
 WHERE a.tenant_id IS NULL
   AND b.tenant_id IS NULL
   AND a.email = b.email
   AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS users_platform_email_unique
  ON users (email)
  WHERE tenant_id IS NULL;

-- 3) 补齐应用级授权的 NULL 语义说明索引（查询路径：按 org+app 取授权）
CREATE INDEX IF NOT EXISTS org_role_grants_app_scope_idx
  ON org_role_grants (app_id, org_id)
  WHERE app_id IS NOT NULL;
