import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from '@capacitor/core'

export type NumberAuthPreLoginResult = {
  available: boolean
  carrier: string
  carrierHint: string
  /** 预取号后的脱敏号，如 191****7776 */
  maskedPhone?: string
  error?: string
  debugLog?: string
}

export type NumberAuthMaskResult = {
  maskedPhone?: string
  carrier: string
  carrierHint: string
  debugLog?: string
}

export type NumberAuthInitResult = {
  ok: boolean
  hasSecret?: boolean
  sdkVersion?: string
  debugLog?: string
}

export interface NumberAuthPlugin {
  initialize(options?: { secret?: string }): Promise<NumberAuthInitResult>
  /** 读取本地缓存的脱敏号（App 启动 warmUp 后通常 <50ms 可用） */
  getCachedMask(): Promise<NumberAuthMaskResult>
  getMaskedPhone(options?: { secret?: string }): Promise<NumberAuthMaskResult>
  preLogin(options?: { secret?: string }): Promise<NumberAuthPreLoginResult>
  login(options?: { secret?: string }): Promise<{ accessToken: string }>
  /** 静默登录：不弹授权页，直接返回 token；不可用时 reject SILENT_UNAVAILABLE */
  loginSilent(options?: { secret?: string }): Promise<{ accessToken: string }>
  getDebugLogs(): Promise<{ log: string }>
  clearDebugLogs(): Promise<{ ok: boolean }>
  isSupported(): Promise<{ supported: boolean }>
  addListener(
    eventName: 'maskPhoneUpdate',
    listenerFunc: (data: NumberAuthMaskResult) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'authDebugLog',
    listenerFunc: (data: { line: string }) => void,
  ): Promise<PluginListenerHandle>
}

export const NumberAuth = registerPlugin<NumberAuthPlugin>('NumberAuth')

export function isNumberAuthNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}
