-- AlterTable
ALTER TABLE `User` ADD COLUMN `inviteCode` VARCHAR(16) NULL,
    ADD COLUMN `invitedByUserId` VARCHAR(191) NULL,
    ADD COLUMN `invitedAt` DATETIME(3) NULL,
    ADD COLUMN `referralRewardMonths` INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX `User_inviteCode_key` ON `User`(`inviteCode`);

-- CreateTable
CREATE TABLE `Referral` (
    `id` VARCHAR(191) NOT NULL,
    `inviterId` VARCHAR(191) NOT NULL,
    `inviteeId` VARCHAR(191) NOT NULL,
    `inviteCode` VARCHAR(16) NOT NULL,
    `grantedDays` INTEGER NOT NULL DEFAULT 30,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Referral_inviteeId_key`(`inviteeId`),
    INDEX `Referral_inviterId_idx`(`inviterId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
