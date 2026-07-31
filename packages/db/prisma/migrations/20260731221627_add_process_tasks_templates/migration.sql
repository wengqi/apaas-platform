-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DELEGATED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "NodeExecStatus" ADD VALUE 'WAITING';

-- CreateTable
CREATE TABLE "process_tasks" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "node_execution_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "task_name" TEXT NOT NULL,
    "assignee" TEXT,
    "candidateGroups" TEXT[],
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "decision" TEXT,
    "comment" TEXT,
    "formdata" JSONB,
    "delegated_to" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "process_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "title_template" TEXT NOT NULL,
    "body_template" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "process_tasks_tenant_id_idx" ON "process_tasks"("tenant_id");

-- CreateIndex
CREATE INDEX "process_tasks_instance_id_idx" ON "process_tasks"("instance_id");

-- CreateIndex
CREATE INDEX "process_tasks_assignee_idx" ON "process_tasks"("assignee");

-- CreateIndex
CREATE INDEX "notification_templates_tenant_id_idx" ON "notification_templates"("tenant_id");

-- CreateIndex
CREATE INDEX "notification_templates_app_id_idx" ON "notification_templates"("app_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_tenant_id_app_id_name_key" ON "notification_templates"("tenant_id", "app_id", "name");

-- AddForeignKey
ALTER TABLE "process_tasks" ADD CONSTRAINT "process_tasks_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "process_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
