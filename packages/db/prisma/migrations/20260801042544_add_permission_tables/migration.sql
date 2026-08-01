-- AlterTable
ALTER TABLE "org_nodes" ADD COLUMN     "node_type" TEXT NOT NULL DEFAULT 'DEPARTMENT';

-- CreateTable
CREATE TABLE "permission_rules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "app_id" TEXT,
    "role_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "target_node_id" TEXT,
    "condition" JSONB,
    "field_scope" JSONB,
    "effect" TEXT NOT NULL DEFAULT 'ALLOW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_role_grants" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "app_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_role_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "resource_id" TEXT,
    "detail" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "permission_rules_tenant_id_idx" ON "permission_rules"("tenant_id");

-- CreateIndex
CREATE INDEX "permission_rules_role_id_idx" ON "permission_rules"("role_id");

-- CreateIndex
CREATE INDEX "permission_rules_tenant_id_type_target_id_idx" ON "permission_rules"("tenant_id", "type", "target_id");

-- CreateIndex
CREATE INDEX "permission_rules_app_id_type_target_id_idx" ON "permission_rules"("app_id", "type", "target_id");

-- CreateIndex
CREATE INDEX "org_role_grants_tenant_id_idx" ON "org_role_grants"("tenant_id");

-- CreateIndex
CREATE INDEX "org_role_grants_org_id_idx" ON "org_role_grants"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_role_grants_org_id_role_id_app_id_key" ON "org_role_grants"("org_id", "role_id", "app_id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_idx" ON "audit_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_action_idx" ON "audit_logs"("tenant_id", "action");

-- AddForeignKey
ALTER TABLE "permission_rules" ADD CONSTRAINT "permission_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_rules" ADD CONSTRAINT "permission_rules_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_role_grants" ADD CONSTRAINT "org_role_grants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_role_grants" ADD CONSTRAINT "org_role_grants_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "org_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_role_grants" ADD CONSTRAINT "org_role_grants_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
