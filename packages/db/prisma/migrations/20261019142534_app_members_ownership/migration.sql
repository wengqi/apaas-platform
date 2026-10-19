-- CreateEnum
CREATE TYPE "AppMemberRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateTable
CREATE TABLE "application_members" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "AppMemberRole" NOT NULL,
    "added_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "application_members_tenant_id_idx" ON "application_members"("tenant_id");

-- CreateIndex
CREATE INDEX "application_members_user_id_idx" ON "application_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "application_members_app_id_user_id_key" ON "application_members"("app_id", "user_id");

-- AddForeignKey
ALTER TABLE "application_members" ADD CONSTRAINT "application_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_members" ADD CONSTRAINT "application_members_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_members" ADD CONSTRAINT "application_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ADR-0005 ①：OWNER 唯一——每个应用至多一行 OWNER（partial unique，先例 20260926190000）
CREATE UNIQUE INDEX "application_members_owner_unique"
  ON "application_members" ("app_id")
  WHERE "role" = 'OWNER';

-- ADR-0005 ②：存量回填——每个存量应用按 created_by 写一行 OWNER。
-- 仅回填创建人仍存在的应用（FK 约束）；创建人已被删除的应用无 OWNER，由 TENANT_ADMIN（恒全量）转移所有权。
INSERT INTO "application_members" ("id", "tenant_id", "app_id", "user_id", "role", "added_by", "created_at")
SELECT gen_random_uuid()::text, a."tenant_id", a."id", a."created_by", 'OWNER', NULL, a."created_at"
FROM "applications" a
INNER JOIN "users" u ON u."id" = a."created_by"
ON CONFLICT ("app_id", "user_id") DO NOTHING;
