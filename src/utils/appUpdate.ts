import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { KuaijiHttp } from '../plugins/kuaijiHttp'

/** 与下载站 `releases.json` 首条对齐，用于「跳过此版本」 */
export const ANDROID_UPDATE_SKIP_TAG_KEY = 'kuaiji_android_update_skip_tag'
export const ANDROID_UPDATE_CACHE_FILENAME = 'kuaiji-latest.apk'

/** 下载 APK / manifest 时追加时间戳，避免运营商或中间层返回旧缓存 */
export function withDownloadCacheBust(url: string): string {
  const u = String(url || '').trim()
  if (!u) return u
  const sep = u.includes('?') ? '&' : '?'
  return `${u}${sep}_=${Date.now()}`
}

/** 生产构建未配置时，与自建下载页默认一致（见 website/docker-compose） */
const DEFAULT_RELEASES_JSON_URL = 'http://8.153.12.131:8080/releases.json'

export type AndroidLatestDisabled = { enabled: false }
export type AndroidLatestEnabled = {
  enabled: true
  /** 当前应执行的步骤：整包优先，壳已最新后再热更 */
  preferredUpdate: 'apk' | 'bundle'
  /** 弹窗展示的版本号（对应当前步骤） */
  versionCode: number
  versionName: string
  /** 整包 APK 下载地址；当前步骤为 bundle 时也可能保留，供提示文案 */
  apkUrl: string
  bundleUrl?: string
  bundleVersion?: string
  minNativeVersionCode?: number
  releaseNotes: string
  skipTag: string
  /** 完成当前整包后，重新打开是否还需热更 */
  pendingBundleAfterApk?: boolean
  pendingBundleVersion?: string
}
export type AndroidLatestResponse = AndroidLatestDisabled | AndroidLatestEnabled

export type ReleaseManifestItem = {
  version?: string
  file?: string
  /** 可选：Web 资源 zip（放 downloads/），与 file 可同时存在；有热更插件时优先热更 */
  bundle?: string
  /** 可选：热更新版本标识，默认同 version */
  bundleVersion?: string
  /** 可选：最低原生 versionCode，低于此值必须整包安装 APK */
  minNativeVersionCode?: number
  notes?: string
  channel?: string
  date?: string
  /** 可选；若填写则与 App.getInfo().build 比较，否则用 version 与 versionName 比 semver */
  versionCode?: number
}

/** 下载站 `releases.json` 完整 URL；开发环境需在 `.env` 配置，生产未配则用公网默认 */
export function getReleasesManifestUrl(): string | undefined {
  const v = import.meta.env.VITE_ANDROID_RELEASES_JSON_URL?.trim()
  if (v) return v
  if (import.meta.env.PROD) return DEFAULT_RELEASES_JSON_URL
  return undefined
}

function apkSkipTag(item: ReleaseManifestItem): string {
  const vc = item.versionCode
  const f = String(item.file ?? '').trim()
  if (typeof vc === 'number' && Number.isFinite(vc) && vc > 0) {
    return `apk|vc:${vc}|f:${f}`
  }
  return `apk|v:${String(item.version ?? '').trim()}|f:${f}`
}

function bundleSkipTag(item: ReleaseManifestItem): string {
  const b = String(item.bundle ?? '').trim()
  const bv = String(item.bundleVersion ?? item.version ?? '').trim()
  return `bundle|bv:${bv}|b:${b}`
}

export function positiveInt(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** 列表中取 versionCode / 版本号最大的 APK 记录 */
export function pickLatestApkEntry(
  items: ReleaseManifestItem[],
): ReleaseManifestItem | null {
  let best: ReleaseManifestItem | null = null
  let bestVc = 0
  let bestSem = ''
  for (const item of items) {
    if (!String(item?.file ?? '').trim()) continue
    const vc = positiveInt(item.versionCode) ?? 0
    const sem = String(item.version ?? '').trim()
    if (!best) {
      best = item
      bestVc = vc
      bestSem = sem
      continue
    }
    if (vc > 0 && bestVc > 0) {
      if (vc > bestVc) {
        best = item
        bestVc = vc
        bestSem = sem
      }
      continue
    }
    if (vc > bestVc) {
      best = item
      bestVc = vc
      bestSem = sem
      continue
    }
    if (sem && (!bestSem || compareSemver(sem, bestSem) > 0)) {
      best = item
      bestVc = vc
      bestSem = sem
    }
  }
  return best
}

/** 列表中取 bundleVersion 最大的热更记录 */
export function pickLatestBundleEntry(
  items: ReleaseManifestItem[],
): ReleaseManifestItem | null {
  let best: ReleaseManifestItem | null = null
  let bestBv = ''
  for (const item of items) {
    if (!String(item?.bundle ?? '').trim()) continue
    const bv = String(item.bundleVersion ?? item.version ?? '').trim()
    if (!bv) continue
    if (!best || compareSemver(bv, bestBv) > 0) {
      best = item
      bestBv = bv
    }
  }
  return best
}

export type ResolveAndroidUpdateInput = {
  items: ReleaseManifestItem[]
  manifestOrigin: string
  localVersionCode: number
  localVersionName: string
  localBundleVersion: string
  capgoAvailable: boolean
}

/**
 * 决定本次更新步骤：若整包 APK 落后于列表最新，则先 APK；壳已满足后再推热更。
 */
export function resolveAndroidUpdatePlan(
  input: ResolveAndroidUpdateInput,
): AndroidLatestResponse {
  const { items, manifestOrigin, localVersionCode, localVersionName } = input
  const apkEntry = pickLatestApkEntry(items)
  const bundleEntry = pickLatestBundleEntry(items)
  if (!apkEntry && !bundleEntry) return { enabled: false }

  const origin = manifestOrigin.replace(/\/$/, '')

  let apkUrl = ''
  let apkVersionCode = 0
  let apkVersionName = ''
  let apkNotes = ''
  if (apkEntry) {
    const file = String(apkEntry.file ?? '')
      .trim()
      .replace(/^\/+/, '')
    apkUrl = `${origin}/downloads/${encodeURIComponent(file)}`
    apkVersionCode = positiveInt(apkEntry.versionCode) ?? 0
    apkVersionName = String(apkEntry.version ?? '').trim()
    apkNotes = String(apkEntry.notes ?? '').trim()
  }

  let bundleUrl: string | undefined
  let bundleVersion: string | undefined
  let minNativeVersionCode: number | undefined
  let bundleNotes = ''
  if (bundleEntry) {
    const bundleFile = String(bundleEntry.bundle ?? '')
      .trim()
      .replace(/^\/+/, '')
    bundleUrl = `${origin}/downloads/${encodeURIComponent(bundleFile)}`
    bundleVersion =
      String(bundleEntry.bundleVersion ?? bundleEntry.version ?? '').trim() ||
      undefined
    minNativeVersionCode = positiveInt(bundleEntry.minNativeVersionCode)
    bundleNotes = String(bundleEntry.notes ?? '').trim()
  }

  const apkForCompare: AndroidLatestEnabled = {
    enabled: true,
    preferredUpdate: 'apk',
    versionCode: apkVersionCode,
    versionName: apkVersionName,
    apkUrl,
    releaseNotes: apkNotes,
    skipTag: apkSkipTag(apkEntry ?? {}),
  }

  const needsApk = Boolean(
    apkUrl && isRemoteNewerThanInstalled(apkForCompare, localVersionCode, localVersionName),
  )

  const shellTooOldForBundle = Boolean(
    bundleUrl &&
      minNativeVersionCode != null &&
      minNativeVersionCode > localVersionCode,
  )

  const needsBundle = Boolean(
    bundleUrl &&
      input.capgoAvailable &&
      !shellTooOldForBundle &&
      !needsApk &&
      isRemoteBundleNewerThanLocal(
        bundleVersion ?? '',
        input.localBundleVersion,
      ),
  )

  if (!needsApk && !needsBundle) return { enabled: false }

  const pendingBundleAfterApk = Boolean(
    needsApk &&
      bundleUrl &&
      input.capgoAvailable &&
      isRemoteBundleNewerThanLocal(
        bundleVersion ?? '',
        input.localBundleVersion,
      ),
  )

  if (needsApk) {
    return {
      enabled: true,
      preferredUpdate: 'apk',
      versionCode: apkVersionCode,
      versionName: apkVersionName,
      apkUrl,
      bundleUrl,
      bundleVersion,
      minNativeVersionCode,
      releaseNotes: apkNotes,
      skipTag: apkSkipTag(apkEntry!),
      pendingBundleAfterApk,
      pendingBundleVersion: bundleVersion,
    }
  }

  return {
    enabled: true,
    preferredUpdate: 'bundle',
    versionCode: 0,
    versionName: bundleVersion ?? String(bundleEntry?.version ?? '').trim(),
    apkUrl,
    bundleUrl,
    bundleVersion,
    minNativeVersionCode,
    releaseNotes: bundleNotes,
    skipTag: bundleSkipTag(bundleEntry!),
  }
}

/** a > b 返回正数；用于 manifest 仅有 version 字符串时 */
export function compareSemver(a: string, b: string): number {
  const parse = (s: string) =>
    String(s || '')
      .trim()
      .split(/[.+_-]+/)
      .map((x) => parseInt(x, 10))
      .map((n) => (Number.isFinite(n) ? n : 0))
  const pa = parse(a)
  const pb = parse(b)
  const len = Math.max(pa.length, pb.length, 1)
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da > db ? 1 : -1
  }
  return 0
}

async function fetchUrlAsText(manifestUrl: string): Promise<string> {
  const url = withDownloadCacheBust(manifestUrl)
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      const r = await KuaijiHttp.getText({ url })
      return r.body
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(
        `无法读取版本列表（原生请求）${msg ? `：${msg}` : ''}。请检查网络或下载站地址。`,
      )
    }
  }
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`无法读取版本列表（${res.status}）`)
    return await res.text()
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('无法读取')) throw e
    throw new Error(
      e instanceof Error
        ? `无法读取版本列表：${e.message}`
        : '无法读取版本列表（网络或跨域受限）',
    )
  }
}

export async function loadReleasesManifest(
  manifestUrl: string,
): Promise<{ items: ReleaseManifestItem[]; origin: string }> {
  const text = await fetchUrlAsText(manifestUrl)
  let data: { items?: ReleaseManifestItem[] }
  try {
    data = JSON.parse(text) as { items?: ReleaseManifestItem[] }
  } catch {
    throw new Error('版本列表不是合法 JSON')
  }
  const items = Array.isArray(data.items) ? data.items : []
  const origin = new URL(manifestUrl).origin
  return { items, origin }
}

/** 拉取版本列表并解析：先整包 APK，再热更新 zip */
export async function fetchAndroidUpdatePlan(
  manifestUrl: string,
  localVersionCode: number,
  localVersionName: string,
  localBundleVersion: string,
  capgoAvailable: boolean,
): Promise<AndroidLatestResponse> {
  const { items, origin } = await loadReleasesManifest(manifestUrl)
  return resolveAndroidUpdatePlan({
    items,
    manifestOrigin: origin,
    localVersionCode,
    localVersionName,
    localBundleVersion,
    capgoAvailable,
  })
}

/** @deprecated 使用 fetchAndroidUpdatePlan */
export async function fetchLatestFromReleasesManifest(
  manifestUrl: string,
): Promise<AndroidLatestResponse> {
  return fetchAndroidUpdatePlan(manifestUrl, 0, '', '', true)
}

export function getSkippedTag(): string | null {
  try {
    const raw = localStorage.getItem(ANDROID_UPDATE_SKIP_TAG_KEY)
    return raw && raw.length > 0 ? raw : null
  } catch {
    return null
  }
}

export function setSkippedTag(tag: string) {
  try {
    localStorage.setItem(ANDROID_UPDATE_SKIP_TAG_KEY, tag)
  } catch {
    /* ignore */
  }
}

/** @deprecated 使用 skipTag */
export function getSkippedVersionCode(): number | null {
  const t = getSkippedTag()
  if (!t?.startsWith('vc:')) return null
  const n = parseInt(t.slice(3), 10)
  return Number.isFinite(n) ? n : null
}

/** @deprecated 使用 setSkippedTag */
export function setSkippedVersionCode(vc: number) {
  setSkippedTag(`vc:${vc}`)
}

export function isRemoteNewerThanInstalled(
  latest: AndroidLatestEnabled,
  localVersionCode: number,
  localVersionName: string,
): boolean {
  if (latest.versionCode > 0) {
    return latest.versionCode > localVersionCode
  }
  if (latest.versionName) {
    return compareSemver(latest.versionName, localVersionName) > 0
  }
  return false
}

/** 热更新版本比较：remote 比 local 新则 true；local 为空视为可更新 */
export function isRemoteBundleNewerThanLocal(
  remoteVersion: string,
  localVersion: string,
): boolean {
  const r = String(remoteVersion || '').trim()
  const l = String(localVersion || '').trim()
  if (!r) return false
  if (!l) return true
  return compareSemver(r, l) > 0
}

/** 当前生效的 Web 包版本（Capgo）；无插件或非内置时返回空串 */
export async function getLocalWebBundleVersion(): Promise<string> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return ''
  }
  if (!Capacitor.isPluginAvailable('CapacitorUpdater')) return ''
  const { CapacitorUpdater } = await import('@capgo/capacitor-updater')
  const cur = await CapacitorUpdater.current()
  if (cur.bundle.id === 'builtin') {
    const bv = await CapacitorUpdater.getBuiltinVersion()
    return String(bv.version || '').trim()
  }
  return String(cur.bundle.version || '').trim()
}

/** 将 APK ArrayBuffer 转为 base64，分块避免单次参数过大 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 8192
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, bytes.length)
    const chunk = bytes.subarray(i, end)
    binary += String.fromCharCode.apply(null, chunk as unknown as number[])
  }
  return btoa(binary)
}

export async function downloadApkAsArrayBuffer(
  apkUrl: string,
  onProgress?: (loaded: number, total: number | null) => void,
): Promise<ArrayBuffer> {
  const res = await fetch(withDownloadCacheBust(apkUrl), {
    method: 'GET',
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`下载失败（${res.status}）`)
  const lenHeader = res.headers.get('Content-Length')
  const total = lenHeader ? parseInt(lenHeader, 10) : null
  const validTotal =
    total != null && Number.isFinite(total) && total > 0 ? total : null

  if (!res.body || typeof res.body.getReader !== 'function') {
    const buf = await res.arrayBuffer()
    onProgress?.(buf.byteLength, validTotal)
    return buf
  }

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value?.length) {
      chunks.push(value)
      loaded += value.length
      onProgress?.(loaded, validTotal)
    }
  }
  const out = new Uint8Array(loaded)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out.buffer
}

/** Android 上优先走原生下载，避免 WebView https→http 混合内容导致 fetch 失败 */
export async function downloadApkIntoCapacitorCache(
  apkUrl: string,
  filename: string,
  onProgress?: (loaded: number, total: number | null) => void,
): Promise<void> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      await KuaijiHttp.downloadFile({
        url: withDownloadCacheBust(apkUrl),
        filename,
      })
      return
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(msg ? `下载失败：${msg}` : '下载失败')
    }
  }
  const buf = await downloadApkAsArrayBuffer(apkUrl, onProgress)
  const base64 = arrayBufferToBase64(buf)
  await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  })
}
