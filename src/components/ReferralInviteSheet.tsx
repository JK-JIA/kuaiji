import { useCallback, useEffect, useState } from 'react'
import type { ReferralMeResponse } from '../api/ledgerClient'
import { sharePngBlobWithMobileFallback } from '../utils/exportData'
import {
  getCachedReferralInvite,
  getReferralInvitePosterBlob,
  getReferralInvitePosterUrl,
  preloadReferralInvite,
  refreshReferralInviteStats,
} from '../utils/referralInviteCache'
import { renderReferralInvitePosterBlob } from '../utils/referralInvitePosterCanvas'

type Props = {
  open: boolean
  onClose: () => void
  apiBase: string
  token: string
  inviterDisplayName: string
}

export function ReferralInviteSheet({
  open,
  onClose,
  apiBase,
  token,
  inviterDisplayName,
}: Props) {
  const [data, setData] = useState<ReferralMeResponse | null>(
    () => getCachedReferralInvite()?.data ?? null,
  )
  const [posterUrl, setPosterUrl] = useState<string | null>(
    () => getCachedReferralInvite()?.posterUrl ?? null,
  )
  const [posterPending, setPosterPending] = useState(false)
  const [statsRefreshing, setStatsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [copied, setCopied] = useState(false)

  const applyCache = useCallback(() => {
    const cached = getCachedReferralInvite()
    if (cached) {
      setData(cached.data)
      if (cached.posterUrl) setPosterUrl(cached.posterUrl)
      setError(null)
      return true
    }
    return false
  }, [])

  useEffect(() => {
    if (!open) return

    const hadCache = applyCache()
    if (!hadCache) {
      setPosterPending(true)
      void preloadReferralInvite(apiBase, token, inviterDisplayName)
        .then((me) => {
          if (!me) {
            setError('加载邀请信息失败')
            return
          }
          setData(me)
          setError(null)
          const url = getCachedReferralInvite()?.posterUrl ?? null
          if (url) setPosterUrl(url)
        })
        .catch(() => setError('加载邀请信息失败'))
        .finally(() => setPosterPending(false))
    } else if (!posterUrl) {
      setPosterPending(true)
      void getReferralInvitePosterUrl(inviterDisplayName)
        .then((url) => {
          if (url) setPosterUrl(url)
        })
        .finally(() => setPosterPending(false))
    }

    setStatsRefreshing(true)
    void refreshReferralInviteStats(apiBase, token)
      .then((me) => {
        if (me) setData(me)
      })
      .finally(() => setStatsRefreshing(false))
  }, [open, apiBase, token, inviterDisplayName, applyCache])

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
    setSharing(true)
    try {
      let blob = getReferralInvitePosterBlob()
      if (!blob) {
        blob = await renderReferralInvitePosterBlob({
          inviterName: inviterDisplayName,
          inviteCode: data.inviteCode,
          inviteUrl: data.inviteUrl,
        })
      }
      await sharePngBlobWithMobileFallback(
        `kuaiji-invite-${data.inviteCode}.png`,
        blob,
      )
    } catch (e) {
      alert(e instanceof Error ? e.message : '分享失败')
    } finally {
      setSharing(false)
    }
  }

  const remainingMonths = data
    ? Math.max(0, data.referralMaxRewardMonths - data.referralRewardMonths)
    : 0

  const showContent = data != null
  const showPoster = Boolean(posterUrl)

  return (
    <div
      className={
        open
          ? 'fixed inset-0 z-[85] flex items-end justify-center bg-black/50 p-4 backdrop-blur-[2px] sm:items-center'
          : 'pointer-events-none fixed inset-0 z-[-1] opacity-0'
      }
      role="presentation"
      aria-hidden={!open}
      onClick={open ? onClose : undefined}
    >
      <div
        role="dialog"
        aria-modal={open}
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
          分享链接或邀请图，好友下载安装并完成首笔记账后，您得
          <span className="font-semibold text-[#008055]"> 1 个月 </span>
          会员（最多
          <span className="font-semibold"> 12 个月 </span>）。
          {data?.inviteCode ? (
            <>
              {' '}
              邀请码：
              <span className="font-mono font-semibold">{data.inviteCode}</span>
            </>
          ) : null}
        </p>

        {error ? (
          <p className="mt-6 text-center text-sm text-red-600">{error}</p>
        ) : showContent ? (
          <>
            <div className="mt-4 overflow-hidden rounded-xl border border-kj-border/80 bg-[#f7f4ef] shadow-sm">
              {showPoster ? (
                <img
                  src={posterUrl!}
                  alt="邀请分享图预览"
                  className="block w-full"
                  draggable={false}
                />
              ) : (
                <div className="flex min-h-[200px] items-center justify-center px-4 py-8 text-sm text-kj-muted">
                  {posterPending ? '正在准备二维码…' : '邀请图加载失败，请重试'}
                </div>
              )}
            </div>
            <p className="mt-2 text-center text-[11px] text-kj-muted">
              已成功邀请 {data!.inviteCount} 人 · 已获 {data!.referralRewardMonths}{' '}
              个月
              {remainingMonths > 0
                ? ` · 还可再获 ${remainingMonths} 个月`
                : ' · 已达上限'}
              {statsRefreshing ? ' · 更新中' : ''}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!data?.inviteUrl) return
                  try {
                    await navigator.clipboard.writeText(data.inviteUrl)
                    setCopied(true)
                    window.setTimeout(() => setCopied(false), 2000)
                  } catch {
                    alert(data.inviteUrl)
                  }
                }}
                className="min-w-[30%] flex-1 rounded-xl border border-kj-border-strong py-2.5 text-sm font-semibold text-kj-primary"
              >
                {copied ? '已复制' : '复制链接'}
              </button>
              <button
                type="button"
                onClick={() => void handleCopyCode()}
                className="min-w-[30%] flex-1 rounded-xl border border-kj-border-strong py-2.5 text-sm font-semibold text-kj-primary"
              >
                复制邀请码
              </button>
              <button
                type="button"
                disabled={sharing || !showPoster}
                onClick={() => void handleShare()}
                className="min-w-[30%] flex-1 rounded-xl bg-[#2ecc71] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {sharing ? '分享中…' : '分享邀请图'}
              </button>
            </div>
          </>
        ) : (
          <p className="mt-6 text-center text-sm text-kj-muted">
            {posterPending ? '正在加载…' : '暂无邀请信息'}
          </p>
        )}

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
