-- AlterTable
ALTER TABLE "process_definitions" ADD COLUMN     "cron" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_platform_admin" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "tenant_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "in_app_messages" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "in_app_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "in_app_messages_tenant_id_idx" ON "in_app_messages"("tenant_id");

-- CreateIndex
CREATE INDEX "in_app_messages_user_id_idx" ON "in_app_messages"("user_id");

-- CreateIndex
CREATE INDEX "in_app_messages_user_id_read_idx" ON "in_app_messages"("user_id", "read");

-- CreateIndex
CREATE INDEX "users_is_platform_admin_idx" ON "users"("is_platform_admin");

-- AddForeignKey
ALTER TABLE "in_app_messages" ADD CONSTRAINT "in_app_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
