import { randomBytes } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'

export const REFERRAL_DAYS_PER_INVITE = 30
export const REFERRAL_MAX_REWARD_MONTHS = 12

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

export function buildInviteUrl(code: string): string {
  const base =
    process.env.REFERRAL_INVITE_BASE_URL?.trim() || 'https://kuaijipf.com'
  const url = new URL(base.endsWith('/') ? base : `${base}/`)
  url.searchParams.set('invite', code)
  return url.toString()
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

export type ReferralBindError =
  | 'INVALID_CODE'
  | 'SELF_INVITE'
  | 'ALREADY_INVITED'
  | 'INVITER_NOT_FOUND'

export async function bindReferralInvite(
  prisma: PrismaClient,
  inviteeId: string,
  rawCode: string,
  extendMembership: (
    current: Date | null | undefined,
    grantedDays: number,
  ) => Date,
): Promise<
  | { ok: true; inviterRewarded: boolean; referralRewardMonths: number }
  | { ok: false; error: ReferralBindError }
> {
  const code = normalizeInviteCode(rawCode)
  if (code.length < 4) {
    return { ok: false, error: 'INVALID_CODE' }
  }

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

      const now = new Date()
      await tx.user.update({
        where: { id: inviteeId },
        data: { invitedByUserId: inviter.id, invitedAt: now },
      })

      await tx.referral.create({
        data: {
          inviterId: inviter.id,
          inviteeId: inviteeId,
          inviteCode: code,
          grantedDays: REFERRAL_DAYS_PER_INVITE,
        },
      })

      let inviterRewarded = false
      let referralRewardMonths = inviter.referralRewardMonths
      if (inviter.referralRewardMonths < REFERRAL_MAX_REWARD_MONTHS) {
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
        referralRewardMonths = nextMonths
      }

      return { ok: true, inviterRewarded, referralRewardMonths }
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('Unique constraint') && msg.includes('inviteeId')) {
      return { ok: false, error: 'ALREADY_INVITED' }
    }
    throw e
  }
}

export function referralBindErrorMessage(err: ReferralBindError): string {
  switch (err) {
    case 'INVALID_CODE':
      return '邀请码格式无效'
    case 'SELF_INVITE':
      return '不能使用自己的邀请码'
    case 'ALREADY_INVITED':
      return '您已使用过邀请码，每位用户仅可被邀请一次'
    case 'INVITER_NOT_FOUND':
      return '邀请码不存在'
    default:
      return '绑定失败'
  }
}
