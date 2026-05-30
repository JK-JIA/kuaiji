-- AlterTable
ALTER TABLE `Ledger` ADD COLUMN `customerCatalogJson` JSON NOT NULL DEFAULT ('[]');
ALTER TABLE `Ledger` ADD COLUMN `customerCatalogSuppressedJson` JSON NOT NULL DEFAULT ('[]');
