import { randomBytes } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'

export const REFERRAL_DAYS_PER_INVITE = 30
export const REFERRAL_MAX_REWARD_MONTHS = 12
export const REFERRAL_STATUS_PENDING = 'pending'
export const REFERRAL_STATUS_COMPLETED = 'completed'

const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const INVITE_CODE_LEN = 8

export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function generateInviteCode(): string {
  const bytes = randomBytes(INVITE_CODE_LEN)
  let out = ''
  for (let i = 0; i < INVITE_CODE_LEN; i++) {
    out += INVITE_CODE_CHARS[bytes[i]! % INVITE_CODE_CHARS.length]
  }
  return out
}

/** 方案 B：下载页链接 https://域名/download?invite=CODE */
export function buildInviteDownloadUrl(code: string): string {
  const base =
    process.env.REFERRAL_INVITE_BASE_URL?.trim() || 'https://kuaijipf.com'
  const root = base.replace(/\/$/, '')
  const url = new URL(`${root}/download`)
  url.searchParams.set('invite', code)
  return url.toString()
}

/** @deprecated 使用 buildInviteDownloadUrl */
export function buildInviteUrl(code: string): string {
  return buildInviteDownloadUrl(code)
}

export async function ensureUserInviteCode(
  prisma: PrismaClient,
  userId: string,
): Promise<string> {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { inviteCode: true },
  })
  if (u.inviteCode) return u.inviteCode

  for (let attempt = 0; attempt < 12; attempt++) {
    const code = generateInviteCode()
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { inviteCode: code },
        select: { inviteCode: true },
      })
      return updated.inviteCode!
    } catch {
      /* unique collision */
    }
  }
  throw new Error('INVITE_CODE_GEN_FAILED')
}

export type ReferralAttachError =
  | 'INVALID_CODE'
  | 'SELF_INVITE'
  | 'ALREADY_INVITED'
  | 'INVITER_NOT_FOUND'
  | 'NOT_NEW_USER'
  | 'DEVICE_ALREADY_USED'

export function referralAttachErrorMessage(err: ReferralAttachError): string {
  switch (err) {
    case 'INVALID_CODE':
      return '邀请码格式无效'
    case 'SELF_INVITE':
      return '不能使用自己的邀请码'
    case 'ALREADY_INVITED':
      return '您已使用过邀请码，每位用户仅可被邀请一次'
    case 'INVITER_NOT_FOUND':
      return '邀请码不存在'
    case 'NOT_NEW_USER':
      return '仅新注册用户可使用邀请链接'
    case 'DEVICE_ALREADY_USED':
      return '该设备已参与过邀请活动'
    default:
      return '邀请绑定失败'
  }
}

async function deviceUsedForCompletedReferral(
  tx: Pick<PrismaClient, 'referral'>,
  fingerprint: string,
): Promise<boolean> {
  if (!fingerprint.trim()) return false
  const hit = await tx.referral.findFirst({
    where: {
      deviceFingerprint: fingerprint.trim(),
      status: REFERRAL_STATUS_COMPLETED,
    },
    select: { id: true },
  })
  return Boolean(hit)
}

/**
 * 新用户注册时绑定邀请关系（不发奖，待首笔记账后完成）
 */
export async function attachReferralOnRegister(
  prisma: PrismaClient,
  inviteeId: string,
  rawCode: string,
  deviceFingerprint?: string | null,
): Promise<{ ok: true } | { ok: false; error: ReferralAttachError }> {
  const code = normalizeInviteCode(rawCode)
  if (code.length < 4) {
    return { ok: false, error: 'INVALID_CODE' }
  }
  const fp = deviceFingerprint?.trim() || null

  try {
    return await prisma.$transaction(async (tx) => {
      const invitee = await tx.user.findUniqueOrThrow({
        where: { id: inviteeId },
      })
      if (invitee.invitedByUserId) {
        return { ok: false, error: 'ALREADY_INVITED' }
      }

      const inviter = await tx.user.findUnique({
        where: { inviteCode: code },
      })
      if (!inviter) {
        return { ok: false, error: 'INVITER_NOT_FOUND' }
      }
      if (inviter.id === inviteeId) {
        return { ok: false, error: 'SELF_INVITE' }
      }

      if (fp && (await deviceUsedForCompletedReferral(tx, fp))) {
        return { ok: false, error: 'DEVICE_ALREADY_USED' }
      }

      const now = new Date()
      await tx.user.update({
        where: { id: inviteeId },
        data: {
          invitedByUserId: inviter.id,
          invitedAt: now,
          deviceFingerprint: fp ?? invitee.deviceFingerprint,
        },
      })

      await tx.referral.create({
        data: {
          inviterId: inviter.id,
          inviteeId,
          inviteCode: code,
          grantedDays: REFERRAL_DAYS_PER_INVITE,
          status: REFERRAL_STATUS_PENDING,
          deviceFingerprint: fp,
        },
      })

      return { ok: true }
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('Unique constraint') && msg.includes('inviteeId')) {
      return { ok: false, error: 'ALREADY_INVITED' }
    }
    throw e
  }
}

export type ReferralCompleteResult =
  | {
      ok: true
      completed: true
      inviteeRewarded: boolean
      inviterRewarded: boolean
      inviterNotice: string | null
    }
  | { ok: true; completed: false }
  | { ok: false; error: 'NOT_INVITED' | 'ALREADY_COMPLETED' }

/**
 * 被邀请人完成首笔记账后发放双方会员
 */
export async function completeReferralOnFirstRecord(
  prisma: PrismaClient,
  inviteeId: string,
  extendMembership: (
    current: Date | null | undefined,
    grantedDays: number,
  ) => Date,
): Promise<ReferralCompleteResult> {
  return prisma.$transaction(async (tx) => {
    const referral = await tx.referral.findUnique({
      where: { inviteeId },
      include: {
        inviter: { select: { id: true, referralRewardMonths: true, membershipExpiresAt: true } },
        invitee: { select: { id: true, membershipExpiresAt: true, phone: true } },
      },
    })
    if (!referral) {
      return { ok: true, completed: false }
    }
    if (referral.status === REFERRAL_STATUS_COMPLETED) {
      return { ok: false, error: 'ALREADY_COMPLETED' }
    }

    const now = new Date()
    let inviteeRewarded = referral.inviteeRewarded
    let inviterRewarded = referral.inviterRewarded
    let inviterNotice: string | null = null

    if (!inviteeRewarded) {
      await tx.user.update({
        where: { id: inviteeId },
        data: {
          membershipExpiresAt: extendMembership(
            referral.invitee.membershipExpiresAt,
            REFERRAL_DAYS_PER_INVITE,
          ),
        },
      })
      inviteeRewarded = true
    }

    const inviter = referral.inviter
    if (
      !inviterRewarded &&
      inviter.referralRewardMonths < REFERRAL_MAX_REWARD_MONTHS
    ) {
      const nextMonths = inviter.referralRewardMonths + 1
      await tx.user.update({
        where: { id: inviter.id },
        data: {
          referralRewardMonths: nextMonths,
          membershipExpiresAt: extendMembership(
            inviter.membershipExpiresAt,
            REFERRAL_DAYS_PER_INVITE,
          ),
        },
      })
      inviterRewarded = true
      const label =
        referral.invitee.phone?.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') ??
        '好友'
      inviterNotice = `${label} 已加入，你获得 1 个月会员`
    } else if (!inviterRewarded) {
      inviterRewarded = true
      inviterNotice = '好友已加入（您邀请奖励已达 12 个月上限）'
    }

    await tx.referral.update({
      where: { id: referral.id },
      data: {
        status: REFERRAL_STATUS_COMPLETED,
        completedAt: now,
        inviteeRewarded,
        inviterRewarded,
        inviterNotifiedPending: true,
        inviterNotified: false,
      },
    })

    return {
      ok: true,
      completed: true,
      inviteeRewarded,
      inviterRewarded,
      inviterNotice,
    }
  })
}

function maskInviteePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
}

export type ReferralNoticeItem = {
  id: string
  message: string
  kind: 'registered' | 'completed'
  createdAt: string
}

export async function listInviterNotices(
  prisma: PrismaClient,
  inviterId: string,
): Promise<ReferralNoticeItem[]> {
  const pendingRows = await prisma.referral.findMany({
    where: {
      inviterId,
      status: REFERRAL_STATUS_PENDING,
      inviterNotifiedPending: false,
    },
    orderBy: { createdAt: 'asc' },
    take: 20,
    select: {
      id: true,
      createdAt: true,
      invitee: { select: { phone: true } },
    },
  })

  const completedRows = await prisma.referral.findMany({
    where: {
      inviterId,
      status: REFERRAL_STATUS_COMPLETED,
      inviterNotified: false,
      inviterRewarded: true,
    },
    orderBy: { completedAt: 'asc' },
    take: 20,
    select: {
      id: true,
      completedAt: true,
      createdAt: true,
      invitee: { select: { phone: true } },
    },
  })

  const pendingNotices: ReferralNoticeItem[] = pendingRows.map((r) => {
    const label = maskInviteePhone(r.invitee.phone) ?? '好友'
    return {
      id: r.id,
      kind: 'registered' as const,
      createdAt: r.createdAt.toISOString(),
      message: `${label} 已通过您的邀请注册`,
    }
  })

  const completedNotices: ReferralNoticeItem[] = completedRows.map((r) => {
    const label = maskInviteePhone(r.invitee.phone)
    return {
      id: r.id,
      kind: 'completed' as const,
      createdAt: (r.completedAt ?? r.createdAt).toISOString(),
      message: label
        ? `${label} 已完成首笔记账，你获得 1 个月会员`
        : '你的朋友已完成首笔记账，你获得 1 个月会员',
    }
  })

  return [...pendingNotices, ...completedNotices].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  )
}

export async function ackInviterNotices(
  prisma: PrismaClient,
  inviterId: string,
  ids: string[],
): Promise<void> {
  if (!ids.length) return
  const rows = await prisma.referral.findMany({
    where: { inviterId, id: { in: ids } },
    select: { id: true, status: true },
  })
  const pendingIds = rows
    .filter((r) => r.status === REFERRAL_STATUS_PENDING)
    .map((r) => r.id)
  const completedIds = rows
    .filter((r) => r.status === REFERRAL_STATUS_COMPLETED)
    .map((r) => r.id)
  if (pendingIds.length) {
    await prisma.referral.updateMany({
      where: { inviterId, id: { in: pendingIds } },
      data: { inviterNotifiedPending: true },
    })
  }
  if (completedIds.length) {
    await prisma.referral.updateMany({
      where: { inviterId, id: { in: completedIds } },
      data: { inviterNotified: true },
    })
  }
}

/** 兼容旧客户端：登录后 bind 仅用于补绑（仍不发奖，等同注册绑定） */
export type ReferralBindError = ReferralAttachError

export async function bindReferralInvite(
  prisma: PrismaClient,
  inviteeId: string,
  rawCode: string,
  _extendMembership: (
    current: Date | null | undefined,
    grantedDays: number,
  ) => Date,
): Promise<
  | { ok: true; inviterRewarded: boolean; referralRewardMonths: number }
  | { ok: false; error: ReferralBindError }
> {
  const r = await attachReferralOnRegister(prisma, inviteeId, rawCode, null)
  if (!r.ok) {
    return { ok: false, error: r.error }
  }
  const inviter = await prisma.user.findFirst({
    where: { inviteCode: normalizeInviteCode(rawCode) },
    select: { referralRewardMonths: true },
  })
  return {
    ok: true,
    inviterRewarded: false,
    referralRewardMonths: inviter?.referralRewardMonths ?? 0,
  }
}

export function referralBindErrorMessage(err: ReferralBindError): string {
  return referralAttachErrorMessage(err)
}
