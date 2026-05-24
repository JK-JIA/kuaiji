import { useEffect, useState, type ReactNode } from 'react'
import {
  createMembershipPurchase,
  fetchMembershipPlans,
  fetchMembershipPurchaseStatus,
  getApiBase,
  getStoredToken,
  type MembershipPlanId,
  type MembershipPlanInfo,
} from '../../api/ledgerClient'
import {
  AlipayPay,
  alipaySyncSuccess,
  isAlipayPayNative,
} from '../../plugins/alipayPay'

const PRO_CARD =
  'rounded-3xl bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 text-left shadow-xl ring-1 ring-amber-500/10'

const PRO_TITLE = 'text-[17px] font-semibold text-amber-200/95'
const PRO_SUB = 'text-[13px] leading-relaxed text-kj-muted'

const BENEFITS = [
  {
    n: 1,
    title: '语音输入功能',
    desc: '长按说话即可记账，解放双手。',
  },
  {
    n: 2,
    title: '智能识别功能',
    desc: '自动解析语音与文本中的金额、商品等信息。',
  },
  {
    n: 3,
    title: '数据存储到云端',
    desc: '账单自动同步云端，换机不丢数据。',
  },
] as const

function SheetOverlay({
  open,
  onClose,
  children,
  ariaLabel,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  ariaLabel: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 backdrop-blur-[2px] sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className="w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

export function ProBenefitsSheet({
  open,
  onClose,
  membershipActive,
  membershipExpiresAt,
}: {
  open: boolean
  onClose: () => void
  membershipActive: boolean
  membershipExpiresAt: string | null
}) {
  const expiryLabel = (() => {
    if (!membershipExpiresAt) return null
    const d = new Date(membershipExpiresAt)
    if (Number.isNaN(d.getTime())) return membershipExpiresAt
    return d.toLocaleDateString('zh-CN')
  })()

  return (
    <SheetOverlay open={open} onClose={onClose} ariaLabel="专业版权益">
      <div className={`${PRO_CARD} p-5`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className={PRO_TITLE}>专业版权益</p>
            <p className={`mt-1 ${PRO_SUB}`}>
              {membershipActive
                ? expiryLabel
                  ? `会员有效至 ${expiryLabel}`
                  : '您已开通专业版'
                : '开通后即可使用以下能力'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-kj-surface/10 text-stone-300 transition-colors hover:bg-white hover:bg-kj-hover"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <ul className="space-y-3">
          {BENEFITS.map((b) => (
            <li
              key={b.n}
              className="flex gap-3 rounded-2xl bg-kj-surface/5 px-3.5 py-3 ring-1 ring-white/5"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-[13px] font-bold text-amber-200">
                {b.n}
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-amber-100/95">{b.title}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-kj-muted">{b.desc}</p>
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onClose}
          className="kuaiji-pro-cta-btn mt-5 w-full py-3 text-[15px]"
        >
          我知道了
        </button>
      </div>
    </SheetOverlay>
  )
}

export function ProRedeemSheet({
  open,
  onClose,
  apiBase,
  hasToken,
  membershipActive,
  membershipExpiresAt,
  onNeedLogin,
  onRedeem,
  onPurchaseSuccess,
}: {
  open: boolean
  onClose: () => void
  apiBase: boolean
  hasToken: boolean
  membershipActive: boolean
  membershipExpiresAt: string | null
  onNeedLogin: () => void
  onRedeem: (code: string) => Promise<void>
  onPurchaseSuccess?: () => Promise<void>
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [purchaseBusy, setPurchaseBusy] = useState<MembershipPlanId | null>(null)
  const [plans, setPlans] = useState<MembershipPlanInfo[]>([])
  const [alipayReady, setAlipayReady] = useState(false)
  const [payMsg, setPayMsg] = useState('')

  useEffect(() => {
    if (open) {
      setCode('')
      setPayMsg('')
    }
  }, [open])

  useEffect(() => {
    if (!open || !apiBase) return
    const base = getApiBase()
    if (!base) return
    void fetchMembershipPlans(base)
      .then((j) => {
        setPlans(j.plans)
        setAlipayReady(j.alipayReady)
      })
      .catch(() => {
        setPlans([])
        setAlipayReady(false)
      })
  }, [open, apiBase])

  const expiryLabel = (() => {
    if (!membershipExpiresAt) return null
    const d = new Date(membershipExpiresAt)
    if (Number.isNaN(d.getTime())) return membershipExpiresAt
    return d.toLocaleDateString('zh-CN')
  })()

  const submit = () => {
    const trimmed = code.trim()
    if (!trimmed || busy) return
    if (!hasToken) {
      onNeedLogin()
      return
    }
    setBusy(true)
    void onRedeem(trimmed).finally(() => setBusy(false))
  }

  const purchase = async (planId: MembershipPlanId) => {
    if (purchaseBusy) return
    if (!hasToken) {
      onNeedLogin()
      return
    }
    if (!isAlipayPayNative()) {
      setPayMsg('请在 Android 应用内使用支付宝支付')
      return
    }
    const base = getApiBase()
    const token = getStoredToken()
    if (!base || !token) {
      setPayMsg('请先登录')
      return
    }

    setPurchaseBusy(planId)
    setPayMsg('')
    try {
      const created = await createMembershipPurchase(base, token, planId)
      const payResult = await AlipayPay.pay({ orderString: created.orderString })
      if (!alipaySyncSuccess(payResult.resultStatus)) {
        setPayMsg(
          payResult.memo?.trim() ||
            (payResult.resultStatus === '6001'
              ? '已取消支付'
              : `支付未完成（${payResult.resultStatus || '未知'}）`),
        )
        return
      }

      let status = await fetchMembershipPurchaseStatus(
        base,
        token,
        created.outTradeNo,
      )
      if (status.status !== 'paid') {
        await new Promise((r) => setTimeout(r, 1200))
        status = await fetchMembershipPurchaseStatus(
          base,
          token,
          created.outTradeNo,
        )
      }

      if (status.status !== 'paid') {
        setPayMsg('支付结果确认中，请稍后在设置页刷新会员状态')
        return
      }

      await onPurchaseSuccess?.()
      setPayMsg('支付成功，专业版已开通')
      setTimeout(() => onClose(), 800)
    } catch (e) {
      setPayMsg(e instanceof Error ? e.message : '支付失败')
    } finally {
      setPurchaseBusy(null)
    }
  }

  const showPurchase =
    apiBase && hasToken && alipayReady && isAlipayPayNative() && plans.length > 0

  return (
    <SheetOverlay open={open} onClose={onClose} ariaLabel="兑换专业版">
      <div className={`${PRO_CARD} p-5`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className={PRO_TITLE}>
              {membershipActive ? '专业版会员' : '升级专业版'}
            </p>
            <p className={`mt-1 ${PRO_SUB}`}>
              {!apiBase
                ? '当前为离线模式，请使用已配置服务的安装包兑换。'
                : membershipActive
                  ? expiryLabel
                    ? `会员有效至 ${expiryLabel}，可继续兑换延长。`
                    : '您已是专业版会员。'
                  : hasToken
                    ? '输入会员兑换码即可开通云端同步等功能。'
                    : '兑换前请先登录账号。'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-kj-surface/10 text-stone-300 transition-colors hover:bg-white hover:bg-kj-hover"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {showPurchase ? (
          <div className="mb-4 space-y-2">
            <p className="text-[12px] font-medium text-kj-muted">支付宝购买</p>
            {plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                disabled={purchaseBusy !== null}
                onClick={() => void purchase(plan.id)}
                className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-kj-surface/5 px-4 py-3 text-left transition-colors hover:bg-white/5 disabled:opacity-50"
              >
                <span className="text-[15px] font-medium text-amber-100/95">
                  专业版 · {plan.label}
                </span>
                <span className="text-[15px] font-semibold text-amber-300">
                  {purchaseBusy === plan.id ? '支付中…' : `¥${plan.priceYuan}`}
                </span>
              </button>
            ))}
            {payMsg ? (
              <p className="text-[12px] leading-relaxed text-amber-200/90">{payMsg}</p>
            ) : (
              <p className="text-[11px] leading-relaxed text-kj-muted">
                沙箱测试请使用支付宝沙箱版 App 与沙箱买家账号。
              </p>
            )}
          </div>
        ) : null}

        {apiBase && hasToken ? (
          <label className="block">
            <span className="mb-2 block text-[12px] font-medium text-kj-muted">
              会员兑换码
            </span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="请输入兑换码"
              disabled={busy}
              className="w-full rounded-2xl border border-white/10 bg-kj-surface/5 px-4 py-3.5 text-[15px] text-amber-50 placeholder:text-stone-500 focus:border-amber-400/40 focus:outline-none focus:ring-2 focus:ring-amber-400/25 disabled:opacity-50"
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
            />
          </label>
        ) : null}

        <div className="mt-5 flex flex-col gap-2">
          {apiBase && !hasToken ? (
            <button
              type="button"
              onClick={() => {
                onClose()
                onNeedLogin()
              }}
              className="kuaiji-pro-cta-btn w-full py-3 text-[15px]"
            >
              去登录
            </button>
          ) : apiBase && hasToken ? (
            <button
              type="button"
              disabled={busy || !code.trim()}
              onClick={submit}
              className="kuaiji-pro-cta-btn w-full py-3 text-[15px] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy ? '兑换中…' : membershipActive ? '兑换延长' : '立即兑换'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="kuaiji-pro-cta-btn w-full py-3 text-[15px]"
            >
              关闭
            </button>
          )}
        </div>
      </div>
    </SheetOverlay>
  )
}
