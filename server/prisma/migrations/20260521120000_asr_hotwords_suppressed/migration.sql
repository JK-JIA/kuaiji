-- AlterTable
ALTER TABLE `Ledger` ADD COLUMN `asrHotwordsSuppressedJson` JSON NOT NULL DEFAULT ('[]');
