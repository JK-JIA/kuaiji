-- 好友注册（pending）与完成首笔记账（completed）分开发送/已读通知
ALTER TABLE `Referral` ADD COLUMN `inviterNotifiedPending` BOOLEAN NOT NULL DEFAULT false;
