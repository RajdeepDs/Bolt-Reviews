-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "autoImportPublish" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "autoPublish" SET DEFAULT true;
