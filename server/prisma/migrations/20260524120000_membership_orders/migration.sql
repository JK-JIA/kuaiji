-- CreateTable
CREATE TABLE `MembershipOrder` (
    `id` VARCHAR(191) NOT NULL,
    `outTradeNo` VARCHAR(64) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(32) NOT NULL,
    `amountYuan` VARCHAR(16) NOT NULL,
    `grantedDays` INTEGER NOT NULL,
    `subject` VARCHAR(128) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `alipayTradeNo` VARCHAR(64) NULL,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MembershipOrder_outTradeNo_key`(`outTradeNo`),
    INDEX `MembershipOrder_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
