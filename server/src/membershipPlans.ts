export type MembershipPlanId = 'monthly' | 'quarterly' | 'yearly'

export type MembershipPlan = {
  id: MembershipPlanId
  label: string
  priceYuan: string
  grantedDays: number
  subject: string
}

export const MEMBERSHIP_PLANS: Record<MembershipPlanId, MembershipPlan> = {
  monthly: {
    id: 'monthly',
    label: '1个月',
    priceYuan: '29.90',
    grantedDays: 30,
    subject: '记账本专业版-1个月',
  },
  quarterly: {
    id: 'quarterly',
    label: '3个月',
    priceYuan: '79.90',
    grantedDays: 90,
    subject: '记账本专业版-3个月',
  },
  yearly: {
    id: 'yearly',
    label: '1年',
    priceYuan: '299.00',
    grantedDays: 365,
    subject: '记账本专业版-1年',
  },
}

export function getMembershipPlan(planId: string): MembershipPlan | null {
  if (planId in MEMBERSHIP_PLANS) {
    return MEMBERSHIP_PLANS[planId as MembershipPlanId]
  }
  return null
}

export function listMembershipPlans(): MembershipPlan[] {
  return Object.values(MEMBERSHIP_PLANS)
}
