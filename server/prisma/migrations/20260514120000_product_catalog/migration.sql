-- AlterTable
ALTER TABLE `Ledger` ADD COLUMN `productCatalogJson` JSON NOT NULL DEFAULT ('[]');
ALTER TABLE `Ledger` ADD COLUMN `productCatalogSuppressedJson` JSON NOT NULL DEFAULT ('[]');
