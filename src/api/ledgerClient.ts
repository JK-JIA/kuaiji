import type { FieldDef, LedgerRecord, ProductCatalogEntry } from '../types'
import type { VoiceProductCorrection } from '../utils/voiceProductCorrections'
import type { DoubaoParseResult } from '../types/voiceParse'
import type { AsrProviderId } from '../utils/asrProvider'

const TOKEN_KEY = 'ledger_auth_token'
const EMAIL_KEY = 'ledger_auth_email'
const MEMBERSHIP_EXPIRES_KEY = 'ledger_membership_expires'
const PHONE_KEY = 'ledger_auth_phone'

/** 生产构建未注入 VITE_API_URL 时使用，避免 APK 内看不到登录入口 */
const DEFAULT_PUBLIC_API = 'http://8.153.12.131:3001'

export function getApiBase(): string | undefined {
  const v = import.meta.env.VITE_API_URL?.trim()
  if (v) return v
  if (import.meta.env.PROD) return DEFAULT_PUBLIC_API
  return undefined
}

const ASR_WS_PATH: Record<AsrProviderId, string> = {
  volc: '/api/asr/stream',
  xfyun: '/api/asr/xfyun/stream',
}

/** 与账本 API 同源的语音识别 WebSocket（需后端配置对应 ASR 环境变量） */
export function getAsrWebSocketUrl(
  base: string,
  provider: AsrProviderId = 'volc',
): string {
  const b = base.replace(/\/$/, '')
  const path = ASR_WS_PATH[provider]
  if (b.startsWith('https://')) return `wss://${b.slice(8)}${path}`
  return `ws://${b.replace(/^http:\/\//, '')}${path}`
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function getStoredEmail(): string | null {
  try {
    return localStorage.getItem(EMAIL_KEY)
  } catch {
    return null
  }
}

export function getStoredPhone(): string | null {
  try {
    return localStorage.getItem(PHONE_KEY)
  } catch {
    return null
  }
}

export function persistSession(
  token: string,
  email: string,
  membershipExpiresAtIso?: string | null,
  phone?: string | null,
) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(EMAIL_KEY, email)
  if (membershipExpiresAtIso) {
    localStorage.setItem(MEMBERSHIP_EXPIRES_KEY, membershipExpiresAtIso)
  } else {
    localStorage.removeItem(MEMBERSHIP_EXPIRES_KEY)
  }
  if (phone) localStorage.setItem(PHONE_KEY, phone)
  else localStorage.removeItem(PHONE_KEY)
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(EMAIL_KEY)
  localStorage.removeItem(MEMBERSHIP_EXPIRES_KEY)
  localStorage.removeItem(PHONE_KEY)
}

export function getStoredMembershipExpires(): string | null {
  try {
    return localStorage.getItem(MEMBERSHIP_EXPIRES_KEY)
  } catch {
    return null
  }
}

export function setStoredMembershipExpires(iso: string | null) {
  try {
    if (iso) localStorage.setItem(MEMBERSHIP_EXPIRES_KEY, iso)
    else localStorage.removeItem(MEMBERSHIP_EXPIRES_KEY)
  } catch {
    /* ignore */
  }
}

export function membershipActiveFromIso(iso: string | null | undefined): boolean {
  if (!iso) return false
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return false
  return t > Date.now()
}

export type MeResponse = {
  email: string
  phone: string | null
  membershipExpiresAt: string | null
}

export async function fetchMe(base: string, token: string): Promise<MeResponse> {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(await parseErr(res))
  return (await res.json()) as MeResponse
}

export async function redeemMembership(
  base: string,
  token: string,
  code: string,
): Promise<MeResponse> {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/membership/redeem`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code: code.trim() }),
  })
  if (!res.ok) throw new Error(await parseErr(res))
  return (await res.json()) as MeResponse
}

export async function sendSmsCode(base: string, phone: string): Promise<void> {
  const res = await fetch(`${base.replace(/\/$/, '')}/auth/sms/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: phone.trim() }),
  })
  if (!res.ok) throw new Error(await parseErr(res))
}

export async function apiOneClickLogin(
  base: string,
  accessToken: string,
): Promise<{
  token: string
  email: string
  membershipExpiresAt: string | null
  phone: string | null
}> {
  const res = await fetch(`${base.replace(/\/$/, '')}/auth/oneclick/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: accessToken.trim() }),
  })
  if (!res.ok) throw new Error(await parseErr(res))
  const j = (await res.json()) as {
    token: string
    user: {
      email: string
      phone: string | null
      membershipExpiresAt: string | null
    }
  }
  return {
    token: j.token,
    email: j.user.email,
    membershipExpiresAt: j.user.membershipExpiresAt,
    phone: j.user.phone,
  }
}

export async function apiSmsLogin(
  base: string,
  phone: string,
  code: string,
): Promise<{
  token: string
  email: string
  membershipExpiresAt: string | null
  phone: string | null
}> {
  const res = await fetch(`${base.replace(/\/$/, '')}/auth/sms/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: phone.trim(), code: code.trim() }),
  })
  if (!res.ok) throw new Error(await parseErr(res))
  const j = (await res.json()) as {
    token: string
    user: {
      email: string
      phone: string | null
      membershipExpiresAt: string | null
    }
  }
  return {
    token: j.token,
    email: j.user.email,
    membershipExpiresAt: j.user.membershipExpiresAt,
    phone: j.user.phone,
  }
}

export type LedgerPayload = {
  fields: FieldDef[]
  records: LedgerRecord[]
  productCatalog?: ProductCatalogEntry[]
  productCatalogSuppressed?: string[]
  /** 用户语音纠错学习（每用户独立，有上限，不进入 AI prompt） */
  voiceProductCorrections?: VoiceProductCorrection[]
  /** 手动排除的 ASR 热词（归一化 token） */
  asrHotwordsSuppressed?: string[]
}

export type LedgerApiResponse = LedgerPayload & {
  updatedAt?: string
}

export type ApiHealth = {
  ok: boolean
  smsLogin?: boolean
  oneClickLogin?: boolean
}

/** 探测服务端是否已部署一键登录等新接口 */
export async function fetchApiHealth(base: string): Promise<ApiHealth> {
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/health`)
    if (!res.ok) return { ok: false }
    return (await res.json()) as ApiHealth
  } catch {
    return { ok: false }
  }
}

async function parseErr(res: Response): Promise<string> {
  if (res.status === 404) {
    return '服务端接口未找到（HTTP 404），请在服务器执行 git pull 后 docker compose up -d --build 更新 API'
  }
  try {
    const j = (await res.json()) as { error?: string }
    return j.error ?? `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

export async function apiLogin(
  base: string,
  email: string,
  password: string,
): Promise<{
  token: string
  email: string
  membershipExpiresAt: string | null
  phone: string | null
}> {
  const res = await fetch(`${base.replace(/\/$/, '')}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(await parseErr(res))
  const j = (await res.json()) as {
    token: string
    user: {
      email: string
      membershipExpiresAt: string | null
      phone?: string | null
    }
  }
  return {
    token: j.token,
    email: j.user.email,
    membershipExpiresAt: j.user.membershipExpiresAt ?? null,
    phone: j.user.phone ?? null,
  }
}

export async function apiRegister(
  base: string,
  email: string,
  password: string,
): Promise<{
  token: string
  email: string
  membershipExpiresAt: string | null
  phone: string | null
}> {
  const res = await fetch(`${base.replace(/\/$/, '')}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(await parseErr(res))
  const j = (await res.json()) as {
    token: string
    user: {
      email: string
      membershipExpiresAt: string | null
      phone?: string | null
    }
  }
  return {
    token: j.token,
    email: j.user.email,
    membershipExpiresAt: j.user.membershipExpiresAt ?? null,
    phone: j.user.phone ?? null,
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 20_000,
): Promise<Response> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: ac.signal })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('连接服务器超时，请检查网络或 API 地址')
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchLedger(
  base: string,
  token: string,
): Promise<LedgerApiResponse> {
  const res = await fetchWithTimeout(
    `${base.replace(/\/$/, '')}/api/ledger`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error(await parseErr(res))
  return (await res.json()) as LedgerApiResponse
}

export async function putLedger(
  base: string,
  token: string,
  payload: LedgerPayload,
): Promise<LedgerApiResponse> {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/ledger`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await parseErr(res))
  return (await res.json()) as LedgerApiResponse
}

export type VoiceLedgerParseResponse = {
  result: DoubaoParseResult
  /** HTTP 状态；2xx 时 result.success 可能仍为 false（业务错误） */
  httpStatus: number
}

/** 语音口语 → 账单字段（优先走服务端 /api/voice/parse） */
export async function parseVoiceLedger(
  base: string,
  token: string,
  text: string,
  fields: Array<{ id: string; name: string; key?: string }>,
  catalogOpts?: {
    productCatalog?: string[]
    productCatalogPromptSection?: string
  },
): Promise<VoiceLedgerParseResponse> {
  const res = await fetchWithTimeout(
    `${base.replace(/\/$/, '')}/api/voice/parse`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        fields,
        productCatalog: catalogOpts?.productCatalog,
        productCatalogPromptSection:
          catalogOpts?.productCatalogPromptSection,
      }),
    },
  )
  let data: DoubaoParseResult & { error?: string }
  try {
    data = (await res.json()) as DoubaoParseResult & { error?: string }
  } catch {
    return {
      httpStatus: res.status,
      result: { success: false, error: `解析服务异常（${res.status}）` },
    }
  }
  if (!res.ok) {
    return {
      httpStatus: res.status,
      result: {
        success: false,
        error: data.error ?? `解析服务错误（${res.status}）`,
      },
    }
  }
  return { httpStatus: res.status, result: data }
}
