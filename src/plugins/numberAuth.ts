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
}

export type NumberAuthMaskResult = {
  maskedPhone?: string
  carrier: string
  carrierHint: string
}

export interface NumberAuthPlugin {
  initialize(options?: { secret?: string }): Promise<{ ok: boolean }>
  getMaskedPhone(options?: { secret?: string }): Promise<NumberAuthMaskResult>
  preLogin(options?: { secret?: string }): Promise<NumberAuthPreLoginResult>
  login(options?: { secret?: string }): Promise<{ accessToken: string }>
  isSupported(): Promise<{ supported: boolean }>
  addListener(
    eventName: 'maskPhoneUpdate',
    listenerFunc: (data: NumberAuthMaskResult) => void,
  ): Promise<PluginListenerHandle>
}

export const NumberAuth = registerPlugin<NumberAuthPlugin>('NumberAuth')

export function isNumberAuthNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}
