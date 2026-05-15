import type { CapacitorConfig } from '@capacitor/cli'
import { APP_VERSION } from './src/version'

const config: CapacitorConfig = {
  appId: 'com.ledgernotes.app',
  appName: '记账本',
  webDir: 'dist',
  plugins: {
    CapacitorUpdater: {
      /** 手动拉取 releases.json，此处关闭自动检查与上报 */
      autoUpdate: false,
      statsUrl: '',
      /** 与内置包版本对齐，便于 Capgo 比对 */
      version: APP_VERSION,
      appReadyTimeout: 20000,
    },
  },
}

export default config
