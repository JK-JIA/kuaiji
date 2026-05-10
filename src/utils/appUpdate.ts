import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { KuaijiHttp } from '../plugins/kuaijiHttp'

/** 与下载站 `releases.json` 首条对齐，用于「跳过此版本」 */
export const ANDROID_UPDATE_SKIP_TAG_KEY = 'kuaiji_android_update_skip_tag'
export const ANDROID_UPDATE_CACHE_FILENAME = 'kuaiji-latest.apk'

/** 生产构建未配置时，与自建下载页默认一致（见 website/docker-compose） */
const DEFAULT_RELEASES_JSON_URL = 'http://8.153.12.131:8080/releases.json'

export type AndroidLatestDisabled = { enabled: false }
export type AndroidLatestEnabled = {
  enabled: true
  /** 来自 manifest 的 versionCode；未填则为 0，此时用 versionName 做 semver 比较 */
  versionCode: number
  versionName: string
  apkUrl: string
  releaseNotes: string
  /** 与首条 release 对应，写入 localStorage 跳过 */
  skipTag: string
}
export type AndroidLatestResponse = AndroidLatestDisabled | AndroidLatestEnabled

export type ReleaseManifestItem = {
  version?: string
  file?: string
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

function releaseItemTag(item: ReleaseManifestItem): string {
  const vc = item.versionCode
  if (typeof vc === 'number' && Number.isFinite(vc) && vc > 0) {
    return `vc:${vc}`
  }
  return `v:${String(item.version ?? '').trim()}|f:${String(item.file ?? '').trim()}`
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
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      const r = await KuaijiHttp.getText({ url: manifestUrl })
      return r.body
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(
        `无法读取版本列表（原生请求）${msg ? `：${msg}` : ''}。请检查网络或下载站地址。`,
      )
    }
  }
  try {
    const res = await fetch(manifestUrl, { cache: 'no-store' })
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

/** 从记账本下载站 `releases.json` 取列表第一条为最新版（与 website 管理后台顺序一致） */
export async function fetchLatestFromReleasesManifest(
  manifestUrl: string,
): Promise<AndroidLatestResponse> {
  const text = await fetchUrlAsText(manifestUrl)
  let data: { items?: ReleaseManifestItem[] }
  try {
    data = JSON.parse(text) as { items?: ReleaseManifestItem[] }
  } catch {
    throw new Error('版本列表不是合法 JSON')
  }
  const items = Array.isArray(data.items) ? data.items : []
  const item = items[0]
  if (!item?.file) return { enabled: false }

  const base = new URL(manifestUrl)
  const file = String(item.file).replace(/^\/+/, '')
  const apkUrl = `${base.origin}/downloads/${encodeURIComponent(file)}`

  const versionName = String(item.version ?? '').trim()
  const notes = String(item.notes ?? '').trim()
  const versionCode =
    typeof item.versionCode === 'number' &&
    Number.isFinite(item.versionCode) &&
    item.versionCode > 0
      ? item.versionCode
      : 0

  return {
    enabled: true,
    versionCode,
    versionName,
    apkUrl,
    releaseNotes: notes,
    skipTag: releaseItemTag(item),
  }
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
  const res = await fetch(apkUrl, { method: 'GET' })
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
      await KuaijiHttp.downloadFile({ url: apkUrl, filename })
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
