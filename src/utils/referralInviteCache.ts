import { fetchReferralMe, type ReferralMeResponse } from '../api/ledgerClient'
import { renderReferralInvitePosterBlob } from './referralInvitePosterCanvas'

const INVITE_BASE =
  import.meta.env.VITE_REFERRAL_INVITE_BASE_URL?.trim() || 'https://kuaijipf.com'

export function buildInviteDownloadUrlClient(code: string): string {
  const root = INVITE_BASE.replace(/\/$/, '')
  return `${root}/download?invite=${encodeURIComponent(code)}`
}

type PosterCache = {
  key: string
  blob: Blob
  objectUrl: string
}

let referralData: ReferralMeResponse | null = null
let posterCache: PosterCache | null = null
let preloadPromise: Promise<ReferralMeResponse | null> | null = null

function posterCacheKey(inviteCode: string, inviterName: string): string {
  return `${inviteCode}|${inviterName.trim()}`
}

function revokePosterCache() {
  if (posterCache) {
    URL.revokeObjectURL(posterCache.objectUrl)
    posterCache = null
  }
}

export function clearReferralInviteCache() {
  referralData = null
  revokePosterCache()
  preloadPromise = null
}

export function getCachedReferralInvite(): {
  data: ReferralMeResponse
  posterUrl: string | null
  posterBlob: Blob | null
} | null {
  if (!referralData) return null
  const posterMatches =
    posterCache != null &&
    posterCache.key.startsWith(`${referralData.inviteCode}|`)
  return {
    data: referralData,
    posterUrl: posterMatches ? posterCache!.objectUrl : null,
    posterBlob: posterMatches ? posterCache!.blob : null,
  }
}

async function ensurePoster(
  data: ReferralMeResponse,
  inviterName: string,
): Promise<string> {
  const key = posterCacheKey(data.inviteCode, inviterName)
  if (posterCache?.key === key) return posterCache.objectUrl

  revokePosterCache()
  const blob = await renderReferralInvitePosterBlob({
    inviterName,
    inviteCode: data.inviteCode,
    inviteUrl: data.inviteUrl,
  })
  const objectUrl = URL.createObjectURL(blob)
  posterCache = { key, blob, objectUrl }
  return objectUrl
}

/** 后台预加载：进入设置页即可触发，打开邀请弹窗时秒开 */
export function preloadReferralInvite(
  apiBase: string,
  token: string,
  inviterName: string,
): Promise<ReferralMeResponse | null> {
  if (preloadPromise) return preloadPromise
  preloadPromise = (async () => {
    try {
      const me = await fetchReferralMe(apiBase, token)
      referralData = me
      await ensurePoster(me, inviterName)
      return me
    } catch {
      return null
    } finally {
      preloadPromise = null
    }
  })()
  return preloadPromise
}

/** 仅刷新邀请人数/月数等统计，不重新生成海报 */
export async function refreshReferralInviteStats(
  apiBase: string,
  token: string,
): Promise<ReferralMeResponse | null> {
  try {
    const me = await fetchReferralMe(apiBase, token)
    if (referralData?.inviteCode === me.inviteCode) {
      referralData = me
    } else {
      referralData = me
      revokePosterCache()
    }
    return me
  } catch {
    return referralData
  }
}

export async function getReferralInvitePosterUrl(
  inviterName: string,
): Promise<string | null> {
  if (!referralData) return null
  try {
    return await ensurePoster(referralData, inviterName)
  } catch {
    return null
  }
}

export function getReferralInvitePosterBlob(): Blob | null {
  return posterCache?.blob ?? null
}
