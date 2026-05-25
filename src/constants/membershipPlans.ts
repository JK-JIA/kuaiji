import type { MembershipPlanInfo } from '../api/ledgerClient'

/** 与 server/src/membershipPlans.ts 保持一致，API 不可用时作展示兜底 */
export const DEFAULT_MEMBERSHIP_PLANS: MembershipPlanInfo[] = [
  { id: 'monthly', label: '1个月', priceYuan: '29.90', grantedDays: 30 },
  { id: 'quarterly', label: '3个月', priceYuan: '79.90', grantedDays: 90 },
  { id: 'yearly', label: '1年', priceYuan: '299.00', grantedDays: 365 },
]
