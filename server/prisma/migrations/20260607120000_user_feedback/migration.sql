-- CreateTable
CREATE TABLE `UserFeedback` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `category` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `contact` VARCHAR(191) NULL,
    `appVersion` VARCHAR(191) NULL,
    `platform` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'open',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserFeedback_createdAt_idx`(`createdAt`),
    INDEX `UserFeedback_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
