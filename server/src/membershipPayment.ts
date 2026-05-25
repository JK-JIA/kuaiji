import { randomBytes } from 'crypto'
import type { PrismaClient } from '@prisma/client'
import {
  alipayAppId,
  alipayConfigWarnings,
  alipayEnvReady,
  alipayNotifyUrl,
  alipaySandboxMode,
  getAlipaySdk,
} from './alipay.js'
import {
  getMembershipPlan,
  listMembershipPlans,
  type MembershipPlanId,
} from './membershipPlans.js'

const MEMBERSHIP_FAR_END = new Date('2099-12-31T15:59:59.000Z')

function membershipActive(expires: Date | null | undefined): expires is Date {
  return expires != null && expires.getTime() > Date.now()
}

function createOutTradeNo(userId: string): string {
  const suffix = randomBytes(4).toString('hex')
  return `KJ${Date.now()}${userId.slice(-4)}${suffix}`.slice(0, 64)
}

export function assertAlipayConfigReady(): void {
  const warnings = alipayConfigWarnings()
  if (warnings.length > 0) {
    throw new Error(`ALIPAY_CONFIG_MISMATCH:${warnings[0]}`)
  }
}

export function membershipAlipayMeta() {
  return {
    alipayReady: alipayEnvReady(),
    alipaySandbox: alipaySandboxMode(),
    alipayAppId: alipayAppId() || undefined,
    alipayWarnings: alipayConfigWarnings(),
  }
}

export function membershipPlansJson() {
  return listMembershipPlans().map((plan) => ({
    id: plan.id,
    label: plan.label,
    priceYuan: plan.priceYuan,
    grantedDays: plan.grantedDays,
  }))
}

export async function createMembershipPurchaseOrder(
  prisma: PrismaClient,
  userId: string,
  planId: MembershipPlanId,
) {
  const plan = getMembershipPlan(planId)
  if (!plan) {
    throw new Error('INVALID_PLAN')
  }

  const outTradeNo = createOutTradeNo(userId)
  const order = await prisma.membershipOrder.create({
    data: {
      outTradeNo,
      userId,
      planId: plan.id,
      amountYuan: plan.priceYuan,
      grantedDays: plan.grantedDays,
      subject: plan.subject,
      status: 'pending',
    },
  })

  const alipaySdk = getAlipaySdk()
  const orderString = alipaySdk.sdkExecute('alipay.trade.app.pay', {
    notifyUrl: alipayNotifyUrl(),
    bizContent: {
      out_trade_no: outTradeNo,
      total_amount: plan.priceYuan,
      subject: plan.subject,
      product_code: 'QUICK_MSECURITY_PAY',
      timeout_express: '30m',
    },
  })

  return {
    order,
    orderString,
    sandbox: alipaySandboxMode(),
  }
}

export async function getMembershipPurchaseOrder(
  prisma: PrismaClient,
  userId: string,
  outTradeNo: string,
) {
  const order = await prisma.membershipOrder.findUnique({
    where: { outTradeNo },
  })
  if (!order || order.userId !== userId) return null
  return order
}

type NotifyPayload = Record<string, string | undefined>

function pickNotify(payload: NotifyPayload, key: string): string {
  const v = payload[key]
  return typeof v === 'string' ? v : ''
}

async function grantMembershipForOrder(
  prisma: PrismaClient,
  order: {
    id: string
    userId: string
    grantedDays: number
    status: string
  },
  alipayTradeNo: string,
) {
  if (order.status === 'paid') return

  await prisma.$transaction(async (tx) => {
    const current = await tx.membershipOrder.findUnique({
      where: { id: order.id },
    })
    if (!current || current.status === 'paid') return

    const user = await tx.user.findUniqueOrThrow({
      where: { id: order.userId },
    })

    const now = new Date()
    const base =
      membershipActive(user.membershipExpiresAt) && user.membershipExpiresAt
        ? user.membershipExpiresAt
        : now
    const membershipExpiresAt = new Date(
      base.getTime() + order.grantedDays * 24 * 60 * 60 * 1000,
    )

    await tx.user.update({
      where: { id: order.userId },
      data: { membershipExpiresAt },
    })

    await tx.membershipOrder.update({
      where: { id: order.id },
      data: {
        status: 'paid',
        alipayTradeNo,
        paidAt: now,
      },
    })
  })
}

export async function handleAlipayNotify(
  prisma: PrismaClient,
  payload: NotifyPayload,
): Promise<'success' | 'fail'> {
  const alipaySdk = getAlipaySdk()
  if (!alipaySdk.checkNotifySign(payload as Record<string, string>)) {
    console.warn('[ledger-api][alipay-notify] invalid sign')
    return 'fail'
  }

  const outTradeNo = pickNotify(payload, 'out_trade_no')
  const tradeStatus = pickNotify(payload, 'trade_status')
  const alipayTradeNo = pickNotify(payload, 'trade_no')

  if (!outTradeNo) return 'fail'

  const order = await prisma.membershipOrder.findUnique({
    where: { outTradeNo },
  })
  if (!order) {
    console.warn('[ledger-api][alipay-notify] unknown order', outTradeNo)
    return 'fail'
  }

  if (order.status === 'paid') return 'success'

  if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
    await grantMembershipForOrder(prisma, order, alipayTradeNo)
    return 'success'
  }

  if (tradeStatus === 'TRADE_CLOSED') {
    await prisma.membershipOrder.update({
      where: { id: order.id },
      data: { status: 'closed' },
    })
    return 'success'
  }

  return 'success'
}

export async function markMembershipOrderPaidFromClient(
  prisma: PrismaClient,
  userId: string,
  outTradeNo: string,
) {
  const order = await getMembershipPurchaseOrder(prisma, userId, outTradeNo)
  if (!order) return null
  if (order.status === 'paid') return order

  try {
    const alipaySdk = getAlipaySdk()
    const result = await alipaySdk.exec('alipay.trade.query', {
      bizContent: { out_trade_no: outTradeNo },
    })
    const tradeStatus =
      typeof result.tradeStatus === 'string'
        ? result.tradeStatus
        : typeof result.trade_status === 'string'
          ? result.trade_status
          : ''
    const alipayTradeNo =
      typeof result.tradeNo === 'string'
        ? result.tradeNo
        : typeof result.trade_no === 'string'
          ? result.trade_no
          : ''

    if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
      await grantMembershipForOrder(prisma, order, alipayTradeNo)
    }
  } catch (e) {
    console.warn('[ledger-api][alipay-query]', e)
  }

  return prisma.membershipOrder.findUnique({ where: { outTradeNo } })
}

export { MEMBERSHIP_FAR_END, membershipActive }
