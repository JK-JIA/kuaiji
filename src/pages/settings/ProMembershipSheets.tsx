import { useEffect, useState, type ReactNode } from 'react'
import {
  createMembershipPurchase,
  fetchApiHealth,
  fetchMembershipPlans,
  fetchMembershipPurchaseStatus,
  getApiBase,
  getStoredToken,
  type MembershipPlanId,
  type MembershipPlanInfo,
} from '../../api/ledgerClient'
import { DEFAULT_MEMBERSHIP_PLANS } from '../../constants/membershipPlans'
import {
  AlipayPay,
  alipaySyncSuccess,
  isAlipayPayNative,
} from '../../plugins/alipayPay'
import {
  alipayDebugLog,
  alipayDebugLogBlock,
  clearAlipayPayDebugLog,
  copyAlipayPayDebugLog,
  getAlipayPayDebugLogText,
} from '../../utils/alipayPayDebug'

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
  onCancelMembership,
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
  onCancelMembership?: () => Promise<void>
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [purchaseBusy, setPurchaseBusy] = useState<MembershipPlanId | null>(null)
  const [plans, setPlans] = useState<MembershipPlanInfo[]>([])
  const [alipayReady, setAlipayReady] = useState(false)
  const [alipayAppId, setAlipayAppId] = useState<string | undefined>()
  const [alipayWarnings, setAlipayWarnings] = useState<string[]>([])
  const [plansLoaded, setPlansLoaded] = useState(false)
  const [payMsg, setPayMsg] = useState('')
  const [payDebugOpen, setPayDebugOpen] = useState(false)
  const [payDebugCopied, setPayDebugCopied] = useState(false)

  useEffect(() => {
    if (open) {
      setCode('')
      setPayMsg('')
      setPayDebugOpen(false)
      setPayDebugCopied(false)
    }
  }, [open])

  useEffect(() => {
    if (!open || !apiBase) return
    const base = getApiBase()
    if (!base) return
    setPlansLoaded(false)
    void fetchMembershipPlans(base)
      .then((j) => {
        setPlans(j.plans.length > 0 ? j.plans : DEFAULT_MEMBERSHIP_PLANS)
        setAlipayReady(j.alipayReady)
        setAlipayAppId(j.alipayAppId)
        setAlipayWarnings(j.alipayWarnings ?? [])
      })
      .catch(async () => {
        setPlans(DEFAULT_MEMBERSHIP_PLANS)
        try {
          const health = await fetchApiHealth(base)
          setAlipayReady(Boolean(health.alipayPay))
          setAlipayAppId(health.alipayAppId)
          setAlipayWarnings(health.alipayWarnings ?? [])
        } catch {
          setAlipayReady(false)
          setAlipayAppId(undefined)
          setAlipayWarnings([])
        }
      })
      .finally(() => setPlansLoaded(true))
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

  const alipayPayEnabled =
    alipayReady && alipayWarnings.length === 0

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
    if (!alipayPayEnabled) {
      setPayMsg(
        alipayWarnings[0] ??
          '服务端支付宝未就绪，请在服务器 git pull 后 docker compose up -d --build',
      )
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
    clearAlipayPayDebugLog()
    alipayDebugLog(`=== 开始购买 ${planId} ===`)
    alipayDebugLog(`apiBase=${base}`)
    alipayDebugLog(`native=${isAlipayPayNative()} alipayReady=${alipayReady}`)
    if (alipayAppId) alipayDebugLog(`health.alipayAppId=${alipayAppId}`)
    if (alipayWarnings.length) alipayDebugLogBlock('health.warnings', alipayWarnings)

    try {
      const created = await createMembershipPurchase(base, token, planId)
      alipayDebugLogBlock('createMembershipPurchase', {
        outTradeNo: created.outTradeNo,
        planId: created.planId,
        amountYuan: created.amountYuan,
        sandbox: created.sandbox,
        orderStringLen: created.orderString?.length ?? 0,
        payDebug: created.payDebug,
      })
      if (created.payDebug?.warnings?.length) {
        alipayDebugLogBlock('server.payDebug.warnings', created.payDebug.warnings)
      }

      const payResult = await AlipayPay.pay({
        orderString: created.orderString,
        sandbox: created.sandbox,
      })
      alipayDebugLogBlock('AlipayPay.pay result', payResult)

      if (!alipaySyncSuccess(payResult.resultStatus)) {
        const memo = payResult.memo?.trim() ?? ''
        const hint =
          memo.includes('商家订单参数异常') && created.sandbox
            ? '（请确认：①服务器 .env 为沙箱 APPID 9021000164606067 + 沙箱「系统默认密钥」应用私钥/支付宝公钥，勿用正式应用密钥；②手机为支付宝沙箱版 App + 沙箱买家账号）'
            : ''
        setPayMsg(
          memo
            ? `${memo}${hint}`
            : payResult.resultStatus === '6001'
              ? '已取消支付'
              : `支付未完成（${payResult.resultStatus || '未知'}）`,
        )
        setPayDebugOpen(true)
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

      alipayDebugLog('支付同步成功，查单确认会员…')
      await onPurchaseSuccess?.()
      setPayMsg('支付成功，专业版已开通')
      setTimeout(() => onClose(), 800)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '支付失败'
      alipayDebugLog(`ERROR: ${msg}`)
      if (e instanceof Error && e.stack) alipayDebugLog(e.stack)
      setPayMsg(msg)
      setPayDebugOpen(true)
    } finally {
      setPurchaseBusy(null)
    }
  }

  const copyPayDebug = async () => {
    const ok = await copyAlipayPayDebugLog()
    setPayDebugCopied(ok)
    if (ok) setTimeout(() => setPayDebugCopied(false), 2000)
  }

  const nativePay = apiBase && hasToken && isAlipayPayNative()
  const displayPlans = plans.length > 0 ? plans : DEFAULT_MEMBERSHIP_PLANS

  const cancelMembership = () => {
    if (cancelBusy || busy || purchaseBusy) return
    if (
      !window.confirm(
        '确定取消当前账号的专业版会员？取消后可重新用兑换码或支付宝开通（测试用，不退款）。',
      )
    ) {
      return
    }
    setCancelBusy(true)
    void onCancelMembership?.()
      .then(() => {
        setPayMsg('已取消会员，可重新购买或兑换')
      })
      .catch((e) => {
        setPayMsg(e instanceof Error ? e.message : '取消失败')
      })
      .finally(() => setCancelBusy(false))
  }

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
                    ? isAlipayPayNative()
                      ? '可选支付宝购买，或输入兑换码开通。'
                      : '输入会员兑换码即可开通云端同步等功能。'
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

        {nativePay ? (
          <div className="mb-4 space-y-2">
            <p className="text-[12px] font-medium text-kj-muted">支付宝购买</p>
            {displayPlans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                disabled={purchaseBusy !== null || !alipayPayEnabled}
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
            ) : null}
            <div className="rounded-xl border border-white/10 bg-black/20">
              <button
                type="button"
                onClick={() => setPayDebugOpen((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] text-kj-muted"
              >
                <span>支付诊断日志</span>
                <span>{payDebugOpen ? '收起' : '展开'}</span>
              </button>
              {payDebugOpen ? (
                <div className="border-t border-white/10 px-3 pb-3">
                  <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-stone-300">
                    {getAlipayPayDebugLogText() || '（暂无日志，请先点击上方套餐发起支付）'}
                  </pre>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void copyPayDebug()}
                      className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-[12px] font-medium text-amber-200"
                    >
                      {payDebugCopied ? '已复制' : '复制日志'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        clearAlipayPayDebugLog()
                        setPayDebugCopied(false)
                      }}
                      className="rounded-lg border border-white/15 px-3 py-1.5 text-[12px] text-stone-400"
                    >
                      清空
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            {!payMsg && !plansLoaded ? (
              <p className="text-[11px] leading-relaxed text-kj-muted">正在加载支付配置…</p>
            ) : !payMsg && !alipayPayEnabled ? (
              <p className="text-[11px] leading-relaxed text-amber-200/80">
                {alipayWarnings[0] ??
                  (alipayAppId?.startsWith('202100')
                    ? `服务端 APPID 为正式应用 ${alipayAppId}，沙箱支付需改为 9021000164606067 及沙箱系统默认密钥（不是桌面「应用私钥RSA2048」那套）。`
                    : '服务端支付宝未配置或未更新。请在服务器 git pull 后 docker compose up -d --build，并在 .env 配置沙箱 ALIPAY_*。')}
              </p>
            ) : !payMsg ? (
              <p className="text-[11px] leading-relaxed text-kj-muted">
                沙箱测试请使用支付宝沙箱版 App 与沙箱买家账号。出错请展开「支付诊断日志」复制发开发。
              </p>
            ) : null}
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
          {apiBase && hasToken && membershipActive ? (
            <button
              type="button"
              disabled={cancelBusy || busy || purchaseBusy !== null}
              onClick={cancelMembership}
              className="w-full rounded-2xl border border-white/15 py-2.5 text-[13px] font-medium text-stone-400 transition-colors hover:border-red-400/40 hover:text-red-300 disabled:opacity-45"
            >
              {cancelBusy ? '取消中…' : '取消会员（测试）'}
            </button>
          ) : null}
        </div>
      </div>
    </SheetOverlay>
  )
}
