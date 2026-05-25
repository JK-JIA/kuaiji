import type { PrismaClient } from '@prisma/client'
import { membershipActive } from './membershipPayment.js'

function envTrim(name: string): string {
  return process.env[name]?.trim() ?? ''
}

export function siteAdminToken(): string {
  return envTrim('WEBSITE_ADMIN_TOKEN')
}

export function siteAdminReady(): boolean {
  return Boolean(siteAdminToken())
}

export function siteAdminAuthOk(authHeader: string | undefined): boolean {
  const token = siteAdminToken()
  if (!token) return false
  const h = authHeader || ''
  const bearer = h.startsWith('Bearer ') ? h.slice(7).trim() : ''
  return bearer === token
}

export async function buildSiteAdminOverview(prisma: PrismaClient) {
  const now = new Date()
  const [usersTotal, usersWithPhone, ledgerCount] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { phone: { not: null } } }),
    prisma.ledger.count(),
  ])

  const [userAccounts, membershipUsers, orders] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        email: true,
        phone: true,
        createdAt: true,
        membershipExpiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.user.findMany({
      where: { membershipExpiresAt: { not: null } },
      select: {
        id: true,
        email: true,
        phone: true,
        membershipExpiresAt: true,
        createdAt: true,
      },
      orderBy: { membershipExpiresAt: 'desc' },
      take: 200,
    }),
    prisma.membershipOrder.findMany({
      orderBy: { createdAt: 'desc' },
      take: 80,
    }),
  ])

  const orderUserIds = [...new Set(orders.map((o) => o.userId))]
  const orderUsers =
    orderUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: orderUserIds } },
          select: { id: true, email: true, phone: true },
        })
      : []
  const userById = new Map(orderUsers.map((u) => [u.id, u]))

  let membershipActiveCount = 0
  let membershipExpiredCount = 0
  const members: {
    id: string
    email: string
    phone: string | null
    membershipExpiresAt: string | null
    active: boolean
  }[] = []

  for (const u of membershipUsers) {
    const active = membershipActive(u.membershipExpiresAt)
    if (u.membershipExpiresAt) {
      if (active) membershipActiveCount++
      else membershipExpiredCount++
      members.push({
        id: u.id,
        email: u.email,
        phone: u.phone,
        membershipExpiresAt: u.membershipExpiresAt.toISOString(),
        active,
      })
    }
  }

  members.sort((a, b) => {
    const ta = a.membershipExpiresAt
      ? Date.parse(a.membershipExpiresAt)
      : 0
    const tb = b.membershipExpiresAt
      ? Date.parse(b.membershipExpiresAt)
      : 0
    return tb - ta
  })

  const paidOrders = orders.filter((o) => o.status === 'paid')
  const pendingOrders = orders.filter((o) => o.status === 'pending')

  return {
    generatedAt: now.toISOString(),
    usersTotal,
    usersWithPhone,
    ledgerCount,
    membershipActiveCount,
    membershipExpiredCount,
    membershipOrdersPaid: paidOrders.length,
    membershipOrdersUnpaid: pendingOrders.length,
    userAccounts: userAccounts.map((u) => ({
      email: u.email,
      phone: u.phone,
      createdAt: u.createdAt.toISOString(),
      membershipExpiresAt: u.membershipExpiresAt?.toISOString() ?? null,
    })),
    recentOrders: orders.slice(0, 40).map((o) => {
      const u = userById.get(o.userId)
      return {
        outTradeNo: o.outTradeNo,
        planId: o.planId,
        amountYuan: o.amountYuan,
        status: o.status,
        paidAt: o.paidAt?.toISOString() ?? null,
        createdAt: o.createdAt.toISOString(),
        alipayTradeNo: o.alipayTradeNo,
        userEmail: u?.email ?? null,
        userPhone: u?.phone ?? null,
      }
    }),
    members: members.slice(0, 80),
  }
}
