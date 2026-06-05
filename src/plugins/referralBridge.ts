import { registerPlugin } from '@capacitor/core'

export interface ReferralBridgePlugin {
  getDeviceFingerprint(): Promise<{ fingerprint: string }>
  readDownloadPageInvite(options?: {
    url?: string
  }): Promise<{ code: string }>
}

export const ReferralBridge = registerPlugin<ReferralBridgePlugin>(
  'ReferralBridge',
)
