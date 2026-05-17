import { Capacitor } from '@capacitor/core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { BrowserOnlyNotice } from './components/BrowserOnlyNotice'
import './index.css'
import { applyFontSizePercentToHtml, readFontSizePercent } from './utils/appFontSize'
import { initTheme } from './utils/appTheme'

applyFontSizePercentToHtml(readFontSizePercent())
initTheme()

if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
  void import('@capgo/capacitor-updater').then(({ CapacitorUpdater }) => {
    void CapacitorUpdater.notifyAppReady()
  })
}

/** 生产构建仅在 Android APK（Capacitor 原生壳）中展示完整应用；浏览器打开 static 仅见提示。开发：npm run dev 仍可调试。 */
const showFullApp =
  Capacitor.isNativePlatform() ||
  import.meta.env.DEV ||
  import.meta.env.VITE_ALLOW_BROWSER === 'true'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showFullApp ? <App /> : <BrowserOnlyNotice />}
  </StrictMode>,
)
