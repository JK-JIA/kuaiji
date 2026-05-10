import { getApiBase } from '../api/ledgerClient'

export const ANDROID_UPDATE_SKIP_VC_KEY = 'kuaiji_android_update_skip_vc'
export const ANDROID_UPDATE_CACHE_FILENAME = 'kuaiji-latest.apk'

export type AndroidLatestDisabled = { enabled: false }
export type AndroidLatestEnabled = {
  enabled: true
  versionCode: number
  versionName: string
  apkUrl: string
  releaseNotes: string
}
export type AndroidLatestResponse = AndroidLatestDisabled | AndroidLatestEnabled

export async function fetchAndroidLatest(
  apiBase: string,
): Promise<AndroidLatestResponse> {
  const b = apiBase.replace(/\/$/, '')
  const res = await fetch(`${b}/api/app/android-latest`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`检查更新失败（${res.status}）`)
  return (await res.json()) as AndroidLatestResponse
}

export function getSkippedVersionCode(): number | null {
  try {
    const raw = localStorage.getItem(ANDROID_UPDATE_SKIP_VC_KEY)
    if (!raw) return null
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export function setSkippedVersionCode(vc: number) {
  try {
    localStorage.setItem(ANDROID_UPDATE_SKIP_VC_KEY, String(vc))
  } catch {
    /* ignore */
  }
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

export function resolveApiBaseForUpdate(): string | undefined {
  return getApiBase()
}
