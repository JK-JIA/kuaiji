import { Capacitor } from '@capacitor/core'
import { ReferralBridge } from '../plugins/referralBridge'

const WEB_FP_KEY = 'kuaiji_device_fp'

export async function getDeviceFingerprint(): Promise<string | undefined> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      const r = await ReferralBridge.getDeviceFingerprint()
      return r.fingerprint?.trim() || undefined
    } catch {
      return undefined
    }
  }
  try {
    let fp = localStorage.getItem(WEB_FP_KEY)?.trim()
    if (!fp) {
      fp =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`
      localStorage.setItem(WEB_FP_KEY, fp)
    }
    return fp
  } catch {
    return undefined
  }
}
