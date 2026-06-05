import { Capacitor } from '@capacitor/core'
import { ReferralBridge } from '../plugins/referralBridge'
import {
  normalizeInviteCode,
  readPendingInviteCode,
  writePendingInviteCode,
} from './referralInvite'

const DOWNLOAD_PAGE_URL =
  import.meta.env.VITE_REFERRAL_DOWNLOAD_URL?.trim() ||
  'https://kuaijipf.com/download'

/** Android 首次启动：从官网下载页 WebView 存储读取邀请码 */
export async function captureReferralFromDownloadPage(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return
  }
  if (readPendingInviteCode()) return
  try {
    const { code } = await ReferralBridge.readDownloadPageInvite({
      url: DOWNLOAD_PAGE_URL,
    })
    const normalized = code ? normalizeInviteCode(code) : ''
    if (normalized.length >= 4) {
      writePendingInviteCode(normalized)
    }
  } catch {
    /* 无邀请来源时忽略 */
  }
}
