import QRCode from 'qrcode'
import { useCallback, useEffect, useState } from 'react'
import { fetchReferralMe, type ReferralMeResponse } from '../api/ledgerClient'
import { Share } from '@capacitor/share'
import { Capacitor } from '@capacitor/core'

type Props = {
  open: boolean
  onClose: () => void
  apiBase: string
  token: string
}

export function ReferralInviteSheet({ open, onClose, apiBase, token }: Props) {
  const [data, setData] = useState<ReferralMeResponse | null>(null)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const me = await fetchReferralMe(apiBase, token)
      setData(me)
      const url = await QRCode.toDataURL(me.inviteUrl, {
        margin: 1,
        width: 220,
        color: { dark: '#008055', light: '#ffffff' },
      })
      setQrUrl(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
      setData(null)
      setQrUrl(null)
    } finally {
      setLoading(false)
    }
  }, [apiBase, token])

  useEffect(() => {
    if (!open) return
    void load()
  }, [open, load])

  const handleCopyCode = async () => {
    if (!data?.inviteCode) return
    try {
      await navigator.clipboard.writeText(data.inviteCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      alert(`邀请码：${data.inviteCode}`)
    }
  }

  const handleShare = async () => {
    if (!data) return
    const text = `我在用 kuaiji 批发记账，邀请你一起用。下载后登录填写邀请码 ${data.inviteCode}，或扫码：${data.inviteUrl}`
    if (Capacitor.isNativePlatform()) {
      try {
        await Share.share({ title: '邀请好友使用 kuaiji', text, dialogTitle: '分享邀请' })
      } catch {
        /* user dismissed */
      }
      return
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: '邀请好友', text })
        return
      } catch {
        /* fall through */
      }
    }
    void handleCopyCode()
  }

  if (!open) return null

  const remainingMonths = data
    ? Math.max(0, data.referralMaxRewardMonths - data.referralRewardMonths)
    : 0

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end justify-center bg-black/50 p-4 backdrop-blur-[2px] sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="referral-invite-title"
        className="max-h-[min(88dvh,640px)] w-full max-w-md overflow-y-auto rounded-2xl bg-kj-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="referral-invite-title"
          className="text-center text-base font-bold text-kj-primary"
        >
          邀请好友
        </h2>
        <p className="mt-2 text-center text-xs leading-relaxed text-kj-secondary">
          好友下载后填写您的邀请码或扫下方二维码。每成功邀请 1 人，您可获得
          <span className="font-semibold text-[#008055]"> 1 个月 </span>
          会员，最多累计
          <span className="font-semibold"> 12 个月 </span>。每位新用户仅可被邀请一次。
        </p>

        {loading ? (
          <p className="mt-6 text-center text-sm text-kj-muted">加载中…</p>
        ) : error ? (
          <p className="mt-6 text-center text-sm text-red-600">{error}</p>
        ) : data ? (
          <>
            <div className="mt-4 flex justify-center">
              {qrUrl ? (
                <img
                  src={qrUrl}
                  alt="邀请二维码"
                  className="h-[220px] w-[220px] rounded-xl border border-kj-border/80 bg-white p-2"
                />
              ) : null}
            </div>
            <p className="mt-3 text-center text-lg font-bold tracking-widest text-kj-primary">
              {data.inviteCode}
            </p>
            <p className="mt-1 text-center text-[11px] text-kj-muted">
              已成功邀请 {data.inviteCount} 人 · 已获 {data.referralRewardMonths} 个月奖励
              {remainingMonths > 0
                ? ` · 还可再获 ${remainingMonths} 个月`
                : ' · 已达上限'}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => void handleCopyCode()}
                className="flex-1 rounded-xl border border-kj-border-strong py-2.5 text-sm font-semibold text-kj-primary"
              >
                {copied ? '已复制' : '复制邀请码'}
              </button>
              <button
                type="button"
                onClick={() => void handleShare()}
                className="flex-1 rounded-xl bg-[#2ecc71] py-2.5 text-sm font-semibold text-white"
              >
                分享邀请
              </button>
            </div>
          </>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl border border-kj-border-strong py-2.5 text-sm font-semibold text-kj-secondary"
        >
          关闭
        </button>
      </div>
    </div>
  )
}
