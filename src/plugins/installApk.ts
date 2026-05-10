import { registerPlugin } from '@capacitor/core'

export interface InstallApkPlugin {
  installFromCache(options: { filename: string }): Promise<void>
}

export const InstallApk = registerPlugin<InstallApkPlugin>('InstallApk')
