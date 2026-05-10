import { registerPlugin } from '@capacitor/core'

export interface KuaijiHttpPlugin {
  getText(options: { url: string }): Promise<{ body: string }>
  downloadFile(options: { url: string; filename: string }): Promise<{ path: string }>
}

export const KuaijiHttp = registerPlugin<KuaijiHttpPlugin>('KuaijiHttp')
