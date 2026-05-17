import { App } from '@capacitor/app'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ANDROID_UPDATE_CACHE_FILENAME,
  downloadApkIntoCapacitorCache,
  fetchLatestFromReleasesManifest,
  getLocalWebBundleVersion,
  getReleasesManifestUrl,
  getSkippedTag,
  isRemoteBundleNewerThanLocal,
  isRemoteNewerThanInstalled,
  setSkippedTag,
  type AndroidLatestEnabled,
} from '../utils/appUpdate'
import { InstallApk } from '../plugins/installApk'

/** 设置页「检查更新」触发：监听后执行与启动时相同的拉取逻辑 */
export const TRIGGER_ANDROID_UPDATE_CHECK = 'kuaiji-trigger-android-update-check'

type UpdateGateState = {
  info: AndroidLatestEnabled
  preferredUpdate: 'bundle' | 'apk'
}

export function AppUpdateGate() {
  const [gate, setGate] = useState<UpdateGateState | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState<{ pct: number | null }>({
    pct: null,
  })
  const manualRef = useRef(false)
  /** 本次运行内点过「稍后」则不再在 resume 时弹窗，避免反复打断 */
  const sessionDismissedRef = useRef(false)

  const info = gate?.info ?? null
  const preferredUpdate = gate?.preferredUpdate ?? 'apk'

  const runCheck = useCallback(async (opts: { manual: boolean }) => {
    if (!opts.manual && sessionDismissedRef.current) return
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      if (opts.manual) alert('仅 Android 应用内支持检查更新')
      return
    }
    const manifestUrl = getReleasesManifestUrl()
    if (!manifestUrl) {
      if (opts.manual) {
        alert(
          '未配置版本列表地址。请在 .env 设置 VITE_ANDROID_RELEASES_JSON_URL（例如 http://服务器:8080/releases.json）后重新打包。',
        )
      }
      return
    }
    let latest: Awaited<ReturnType<typeof fetchLatestFromReleasesManifest>>
    try {
      latest = await fetchLatestFromReleasesManifest(manifestUrl)
    } catch (e) {
      if (opts.manual) {
        alert(e instanceof Error ? e.message : '检查更新失败')
      }
      return
    }
    if (!latest.enabled) {
      if (opts.manual) alert('下载站暂无发布版本（releases.json 为空）')
      return
    }

    const appInfo = await App.getInfo()
    const localVc = parseInt(String(appInfo.build), 10)
    const localVn = String(appInfo.version ?? '').trim()
    if (!Number.isFinite(localVc)) {
      if (opts.manual) alert('无法读取当前应用版本号')
      return
    }

    const skip = getSkippedTag()
    if (!opts.manual && skip === latest.skipTag) return

    const minN = latest.minNativeVersionCode
    const shellTooOldForBundle = Boolean(
      latest.bundleUrl &&
        minN != null &&
        minN > localVc,
    )
    const capgoOk = Capacitor.isPluginAvailable('CapacitorUpdater')

    let preferred: 'bundle' | 'apk' | null = null

    if (latest.bundleUrl && !shellTooOldForBundle && capgoOk) {
      const bvRemote = String(
        latest.bundleVersion ?? latest.versionName ?? '',
      ).trim()
      const localBv = await getLocalWebBundleVersion()
      if (isRemoteBundleNewerThanLocal(bvRemote, localBv)) {
        preferred = 'bundle'
      }
    }

    if (preferred == null && latest.apkUrl) {
      if (isRemoteNewerThanInstalled(latest, localVc, localVn)) {
        preferred = 'apk'
      }
    }

    if (preferred == null) {
      if (opts.manual) {
        if (latest.bundleUrl && shellTooOldForBundle) {
          alert(
            '服务器要求更高版本的原生安装包，请下载整包 APK 更新（更新后可继续用热更新）。',
          )
        } else if (latest.bundleUrl && !capgoOk) {
          alert(
            '当前安装的应用不含热更新能力，请从下载站安装一次完整 APK，之后即可在线更新网页部分。',
          )
        } else {
          alert('当前已是最新版本')
        }
      }
      return
    }

    manualRef.current = opts.manual
    setGate({ info: latest, preferredUpdate: preferred })
  }, [])

  useEffect(() => {
    void runCheck({ manual: false })
  }, [runCheck])

  useEffect(() => {
    let handle: PluginListenerHandle | undefined
    void App.addListener('resume', () => {
      void runCheck({ manual: false })
    }).then((h) => {
      handle = h
    })
    return () => {
      void handle?.remove()
    }
  }, [runCheck])

  useEffect(() => {
    const onTrigger = () => {
      void runCheck({ manual: true })
    }
    window.addEventListener(TRIGGER_ANDROID_UPDATE_CHECK, onTrigger)
    return () =>
      window.removeEventListener(TRIGGER_ANDROID_UPDATE_CHECK, onTrigger)
  }, [runCheck])

  const close = () => {
    setGate(null)
    setProgress({ pct: null })
    manualRef.current = false
  }

  const skipThisVersion = () => {
    if (info) setSkippedTag(info.skipTag)
    close()
  }

  const confirmUpdate = async () => {
    if (!info) return

    if (preferredUpdate === 'bundle' && info.bundleUrl) {
      setDownloading(true)
      setProgress({ pct: 0 })
      let dlHandle: PluginListenerHandle | undefined
      try {
        const { CapacitorUpdater } = await import('@capgo/capacitor-updater')
        dlHandle = await CapacitorUpdater.addListener('download', (ev) => {
          setProgress({ pct: Math.min(99, Math.round(ev.percent)) })
        })
        const bundle = await CapacitorUpdater.download({
          url: info.bundleUrl,
          version: String(info.bundleVersion ?? info.versionName ?? '').trim(),
        })
        await dlHandle.remove()
        dlHandle = undefined
        setProgress({ pct: 100 })
        setDownloading(false)
        alert(
          '更新已下载完毕。点击确定后将立即重启应用（不卸载安装包，本地数据与登录状态会保留）。',
        )
        await CapacitorUpdater.set({ id: bundle.id })
        close()
      } catch (e) {
        if (dlHandle) void dlHandle.remove()
        alert(e instanceof Error ? e.message : '热更新失败')
        setDownloading(false)
        setProgress({ pct: null })
      }
      return
    }

    if (!info.apkUrl) {
      alert('未提供安装包下载地址')
      return
    }

    setDownloading(true)
    setProgress({ pct: null })
    try {
      await downloadApkIntoCapacitorCache(
        info.apkUrl,
        ANDROID_UPDATE_CACHE_FILENAME,
        (loaded, total) => {
          if (total != null && total > 0) {
            setProgress({
              pct: Math.min(99, Math.round((100 * loaded) / total)),
            })
          } else {
            setProgress({ pct: null })
          }
        },
      )
      setProgress({ pct: 100 })
      await InstallApk.installFromCache({
        filename: ANDROID_UPDATE_CACHE_FILENAME,
      })
      close()
    } catch (e) {
      alert(e instanceof Error ? e.message : '下载或安装失败')
    } finally {
      setDownloading(false)
      setProgress({ pct: null })
    }
  }

  if (!gate || !info) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-update-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-kj-border-strong/80 bg-kj-surface p-5 shadow-xl">
        <h2
          id="app-update-title"
          className="text-lg font-semibold text-kj-primary"
        >
          {preferredUpdate === 'bundle' ? '发现网页更新' : '发现新版本'}
        </h2>
        <p className="mt-2 text-sm text-neutral-700">
          {info.versionName
            ? info.versionCode > 0
              ? `版本 ${info.versionName}（versionCode ${info.versionCode}）`
              : `版本 ${info.versionName}`
            : info.versionCode > 0
              ? `versionCode ${info.versionCode}`
              : '新版本'}
        </p>
        {preferredUpdate === 'bundle' ? (
          <p className="mt-2 text-xs leading-relaxed text-[#1a7f4c]">
            此为网页资源热更新，无需卸载重装，下载完成后重启即可生效。
          </p>
        ) : null}
        {info.releaseNotes ? (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-600">
            {info.releaseNotes}
          </p>
        ) : null}
        {downloading ? (
          <p className="mt-4 text-sm text-neutral-600">
            {progress.pct != null ? `正在下载… ${progress.pct}%` : '正在下载…'}
          </p>
        ) : null}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            type="button"
            disabled={downloading}
            onClick={() => {
              sessionDismissedRef.current = true
              if (manualRef.current) alert('可稍后在设置中再次检查更新')
              close()
            }}
            className="min-h-[44px] rounded-xl border border-kj-border-strong bg-kj-raised px-4 py-2.5 text-sm font-medium text-kj-primary disabled:opacity-50"
          >
            稍后
          </button>
          <button
            type="button"
            disabled={downloading}
            onClick={skipThisVersion}
            className="min-h-[44px] rounded-xl border border-kj-border-strong bg-kj-surface px-4 py-2.5 text-sm font-medium text-neutral-700 disabled:opacity-50"
          >
            跳过此版本
          </button>
          <button
            type="button"
            disabled={downloading}
            onClick={() => void confirmUpdate()}
            className="min-h-[44px] rounded-xl bg-[#2ecc71] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#27ae60] disabled:opacity-50"
          >
            {preferredUpdate === 'bundle' ? '立即热更新' : '立即更新'}
          </button>
        </div>
      </div>
    </div>
  )
}
