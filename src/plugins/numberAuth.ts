import { Capacitor, registerPlugin } from '@capacitor/core'

export type NumberAuthPreLoginResult = {
  available: boolean
  carrier: string
  carrierHint: string
  /** 预取号后的脱敏号，如 191****7776 */
  maskedPhone?: string
  error?: string
}

export interface NumberAuthPlugin {
  initialize(options?: { secret?: string }): Promise<{ ok: boolean }>
  preLogin(options?: { secret?: string }): Promise<NumberAuthPreLoginResult>
  login(options?: { secret?: string }): Promise<{ accessToken: string }>
  isSupported(): Promise<{ supported: boolean }>
}

export const NumberAuth = registerPlugin<NumberAuthPlugin>('NumberAuth')

export function isNumberAuthNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}
