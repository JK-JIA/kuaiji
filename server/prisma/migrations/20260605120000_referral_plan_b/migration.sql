-- Plan B: 注册时绑定邀请关系，首笔记账后发放奖励
ALTER TABLE `User` ADD COLUMN `deviceFingerprint` VARCHAR(128) NULL;

ALTER TABLE `Referral` ADD COLUMN `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    ADD COLUMN `deviceFingerprint` VARCHAR(128) NULL,
    ADD COLUMN `completedAt` DATETIME(3) NULL,
    ADD COLUMN `inviteeRewarded` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `inviterRewarded` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `inviterNotified` BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX `Referral_status_idx` ON `Referral`(`status`);
CREATE INDEX `User_deviceFingerprint_idx` ON `User`(`deviceFingerprint`);
