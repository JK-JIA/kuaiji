-- AlterTable
ALTER TABLE `User` ADD COLUMN `phone` VARCHAR(191) NULL,
    ADD COLUMN `phoneVerifiedAt` DATETIME(3) NULL,
    ADD COLUMN `membershipExpiresAt` DATETIME(3) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_phone_key` ON `User`(`phone`);

-- CreateTable
CREATE TABLE `RedeemCode` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `validFrom` DATETIME(3) NOT NULL,
    `validTo` DATETIME(3) NOT NULL,
    `maxUses` INTEGER NOT NULL DEFAULT 1000,
    `usedCount` INTEGER NOT NULL DEFAULT 0,
    `grantedDays` INTEGER NOT NULL DEFAULT 30,
    `batchId` VARCHAR(191) NULL,

    UNIQUE INDEX `RedeemCode_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SmsOtp` (
    `id` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SmsOtp_phone_createdAt_idx`(`phone`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 已有账号默认视为长期会员，避免升级后立刻无法同步
UPDATE `User` SET `membershipExpiresAt` = '2099-12-31 15:59:59' WHERE `membershipExpiresAt` IS NULL;
