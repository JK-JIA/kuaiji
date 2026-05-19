-- AlterTable
ALTER TABLE `Ledger` ADD COLUMN `voiceProductCorrectionsJson` JSON NOT NULL DEFAULT ('[]');
