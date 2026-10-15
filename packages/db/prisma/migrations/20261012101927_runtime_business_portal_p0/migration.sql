-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "is_internal" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "in_app_messages" ADD COLUMN     "link" TEXT;
