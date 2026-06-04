import { registerPlugin } from '@capacitor/core'

export interface InstallApkPlugin {
  installFromCache(options: {
    filename: string
    /** releases.json 中的 versionCode，用于校验下载是否完整、非 CDN 旧包 */
    expectedVersionCode?: number
  }): Promise<void>
}

export const InstallApk = registerPlugin<InstallApkPlugin>('InstallApk')
