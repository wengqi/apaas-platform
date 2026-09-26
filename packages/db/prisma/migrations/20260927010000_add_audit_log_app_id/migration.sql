-- ROADMAP 9.9 应用级审计：audit_logs 增加应用维度
ALTER TABLE "audit_logs" ADD COLUMN "app_id" TEXT;
CREATE INDEX IF NOT EXISTS "audit_logs_tenant_id_app_id_idx" ON "audit_logs" ("tenant_id", "app_id");
