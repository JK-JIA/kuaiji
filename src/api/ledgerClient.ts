import type { FieldDef, LedgerRecord, ProductCatalogEntry, CustomerEntry } from '../types'
import type { VoiceProductCorrection } from '../utils/voiceProductCorrections'
import type { DoubaoParseResult } from '../types/voiceParse'
import type { AsrProviderId } from '../utils/asrProvider'

const TOKEN_KEY = 'ledger_auth_token'
const REFRESH_TOKEN_KEY = 'ledger_auth_refresh_token'
const EMAIL_KEY = 'ledger_auth_email'
const MEMBERSHIP_EXPIRES_KEY = 'ledger_membership_expires'
const PHONE_KEY = 'ledger_auth_phone'

/** access 剩余不足该时长时主动续期 */
const REFRESH_AHEAD_MS = 7 * 24 * 60 * 60 * 1000

type TokenListener = (accessToken: string, refreshToken: string | null) => void
const tokenListeners = new Set<TokenListener>()
let refreshPromise: Promise<string | null> | null = null

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

export function getStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY)
  } catch {
    return null
  }
}

export function onAuthTokensChanged(listener: TokenListener): () => void {
  tokenListeners.add(listener)
  return () => tokenListeners.delete(listener)
}

function notifyTokenListeners(accessToken: string, refreshToken: string | null) {
  for (const fn of tokenListeners) {
    try {
      fn(accessToken, refreshToken)
    } catch {
      /* ignore */
    }
  }
}

export function persistSession(
  token: string,
  email: string,
  membershipExpiresAtIso?: string | null,
  phone?: string | null,
  refreshToken?: string | null,
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
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
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
  welcomeMembershipClaimed: boolean
  inviteCode?: string | null
  invitedByBound?: boolean
  referralRewardMonths?: number
}

export type ReferralNotice = {
  id: string
  message: string
  kind?: 'registered' | 'completed'
  createdAt?: string
}

export const REFERRAL_NOTICES_CHANGED_EVENT = 'kuaiji-referral-notices-changed'

export type ReferralMeResponse = {
  inviteCode: string
  inviteUrl: string
  referralRewardMonths: number
  referralMaxRewardMonths: number
  inviteCount: number
  invitedByBound: boolean
  canEarnMoreReferral: boolean
  notices?: ReferralNotice[]
}

export const REFERRAL_INVITEE_TOAST_KEY = 'kuaiji_referral_invitee_toast'

export type ReferralCompleteResponse = {
  ok: true
  completed: boolean
  inviteeRewarded?: boolean
  inviteeMessage?: string | null
  user?: MeResponse
}

export type ReferralBindResponse = {
  ok: true
  inviterRewarded: boolean
  user: MeResponse
}

export type AuthUserPayload = {
  email: string
  phone?: string | null
  membershipExpiresAt: string | null
  welcomeMembershipClaimed?: boolean
  invitedByBound?: boolean
  inviteCode?: string | null
  referralRewardMonths?: number
}

function mapAuthUser(user: AuthUserPayload) {
  return {
    email: user.email,
    membershipExpiresAt: user.membershipExpiresAt ?? null,
    phone: user.phone ?? null,
    welcomeMembershipClaimed: Boolean(user.welcomeMembershipClaimed),
    invitedByBound: Boolean(user.invitedByBound),
  }
}

type LoginJson = {
  token: string
  refreshToken?: string
  user: AuthUserPayload
}

function mapLoginResult(j: LoginJson) {
  return {
    token: j.token,
    refreshToken: j.refreshToken ?? null,
    ...mapAuthUser(j.user),
  }
}

function jwtExpMs(token: string): number | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const json = JSON.parse(
      atob(part.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { exp?: number }
    return typeof json.exp === 'number' ? json.exp * 1000 : null
  } catch {
    return null
  }
}

function shouldProactivelyRefresh(accessToken: string | null): boolean {
  if (!accessToken) return false
  const exp = jwtExpMs(accessToken)
  if (!exp) return Boolean(getStoredRefreshToken())
  return exp - Date.now() < REFRESH_AHEAD_MS
}

/** 用 refresh（或宽限期内旧 access）换新凭证；失败时不清理会话 */
export async function refreshAccessToken(base: string): Promise<string | null> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    const access = getStoredToken()
    const refresh = getStoredRefreshToken()
    if (!access && !refresh) return null

    const url = `${base.replace(/\/$/, '')}/auth/refresh`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (access) headers.Authorization = `Bearer ${access}`
    const body: Record<string, string> = {}
    if (refresh) body.refreshToken = refresh

    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
    } catch {
      return access
    }

    if (!res.ok) return access

    let j: LoginJson
    try {
      j = (await res.json()) as LoginJson
    } catch {
      return access
    }

    if (!j.token) return access

    const mapped = mapLoginResult(j)
    persistSession(
      j.token,
      mapped.email,
      mapped.membershipExpiresAt,
      mapped.phone,
      j.refreshToken ?? refresh,
    )
    notifyTokenListeners(j.token, j.refreshToken ?? refresh ?? null)
    return j.token
  })().finally(() => {
    refreshPromise = null
  })

  return refreshPromise
}

export async function ensureFreshAccessToken(
  base: string,
): Promise<string | null> {
  const access = getStoredToken()
  if (!access && !getStoredRefreshToken()) return null
  // 旧版仅有 access、无 refresh：启动时静默补发 refresh
  if (access && !getStoredRefreshToken()) {
    const upgraded = await refreshAccessToken(base)
    return upgraded ?? access
  }
  if (!shouldProactivelyRefresh(access)) return access
  const next = await refreshAccessToken(base)
  return next ?? access
}

let proactiveTimer: ReturnType<typeof setInterval> | null = null

/** 启动后定期、回前台时无感续期 */
export function startProactiveTokenRefresh(base: string) {
  if (proactiveTimer) return
  const tick = () => {
    if (!getStoredToken() && !getStoredRefreshToken()) return
    void ensureFreshAccessToken(base)
  }
  tick()
  proactiveTimer = setInterval(tick, 60 * 60 * 1000)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible)
  }
  function onVisible() {
    if (document.visibilityState === 'visible') tick()
  }
}

export function stopProactiveTokenRefresh() {
  if (proactiveTimer) {
    clearInterval(proactiveTimer)
    proactiveTimer = null
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 20_000,
  externalSignal?: AbortSignal,
): Promise<Response> {
  if (externalSignal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  const onExternalAbort = () => ac.abort()
  externalSignal?.addEventListener('abort', onExternalAbort)

  try {
    return await fetch(url, { ...init, signal: ac.signal })
  } catch (e) {
    if (externalSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('连接服务器超时，请检查网络或 API 地址')
    }
    throw e
  } finally {
    clearTimeout(timer)
    externalSignal?.removeEventListener('abort', onExternalAbort)
  }
}

/** 带 Bearer 的请求；401 时自动续期并重试一次 */
async function fetchAuthed(
  base: string,
  path: string,
  init: RequestInit = {},
  options?: {
    token?: string
    timeoutMs?: number
    externalSignal?: AbortSignal
    retried?: boolean
  },
): Promise<Response> {
  const url = path.startsWith('http')
    ? path
    : `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`

  const token = getStoredToken() || options?.token
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const timeoutMs = options?.timeoutMs ?? 20_000
  let res = await fetchWithTimeout(
    url,
    { ...init, headers },
    timeoutMs,
    options?.externalSignal,
  )

  if (res.status === 401 && !options?.retried) {
    const newToken = await refreshAccessToken(base)
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`)
      return fetchAuthed(
        base,
        path,
        { ...init, headers },
        {
          ...options,
          token: newToken,
          retried: true,
        },
      )
    }
  }

  return res
}

export async function fetchMe(base: string, token: string): Promise<MeResponse> {
  const res = await fetchAuthed(base, '/api/me', {}, { token })
  if (!res.ok) throw new Error(await parseErr(res))
  return (await res.json()) as MeResponse
}

export async function redeemMembership(
  base: string,
  token: string,
  code: string,
): Promise<MeResponse> {
  const res = await fetchAuthed(base, '/api/membership/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim() }),
  }, { token })
  if (!res.ok) throw new Error(await parseErr(res))
  return (await res.json()) as MeResponse
}

export async function cancelMembership(
  base: string,
  token: string,
): Promise<MeResponse> {
  const res = await fetchAuthed(base, '/api/membership/cancel', {
    method: 'POST',
  }, { token })
  if (!res.ok) throw new Error(await parseErr(res))
  return (await res.json()) as MeResponse
}

export async function fetchReferralMe(
  base: string,
  token: string,
): Promise<ReferralMeResponse> {
  const res = await fetchAuthed(base, '/api/referral/me', {}, { token })
  if (!res.ok) throw new Error(await parseErr(res))
  return (await res.json()) as ReferralMeResponse
}

export async function bindReferralCode(
  base: string,
  token: string,
  code: string,
): Promise<ReferralBindResponse> {
  const res = await fetchAuthed(base, '/api/referral/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim() }),
  }, { token })
  if (!res.ok) throw new Error(await parseErr(res))
  return (await res.json()) as ReferralBindResponse
}

export async function completeReferralReward(
  base: string,
  token: string,
): Promise<ReferralCompleteResponse> {
  const res = await fetchAuthed(base, '/api/referral/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, { token })
  if (!res.ok) throw new Error(await parseErr(res))
  return (await res.json()) as ReferralCompleteResponse
}

export async function ackReferralNotices(
  base: string,
  token: string,
  ids: string[],
): Promise<void> {
  const res = await fetchAuthed(
    base,
    '/api/referral/notices/ack',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    },
    { token },
  )
  if (!res.ok) throw new Error(await parseErr(res))
}

/** 新用户优惠：免费领取 1 个月会员（每账号一次） */
export async function claimWelcomeMembership(
  base: string,
  token: string,
): Promise<MeResponse> {
  const res = await fetchAuthed(
    base,
    '/api/membership/claim-welcome',
    { method: 'POST' },
    { token },
  )
  if (!res.ok) throw new Error(await parseErr(res))
  return (await res.json()) as MeResponse
}

export async function fetchMembershipPlans(
  base: string,
): Promise<MembershipPlansResponse> {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/membership/plans`)
  if (!res.ok) throw new Error(await parseErr(res))
  return (await res.json()) as MembershipPlansResponse
}

export async function createMembershipPurchase(
  base: string,
  token: string,
  planId: MembershipPlanId,
): Promise<MembershipPurchaseCreateResponse> {
  const res = await fetchAuthed(
    base,
    '/api/membership/purchase/create',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId }),
    },
    { token },
  )
  if (!res.ok) throw new Error(await parseErr(res))
  return (await res.json()) as MembershipPurchaseCreateResponse
}

export async function fetchMembershipPurchaseStatus(
  base: string,
  token: string,
  outTradeNo: string,
): Promise<MembershipPurchaseStatusResponse> {
  const q = new URLSearchParams({ outTradeNo })
  const res = await fetchAuthed(
    base,
    `/api/membership/purchase/status?${q}`,
    {},
    { token },
  )
  if (!res.ok) throw new Error(await parseErr(res))
  return (await res.json()) as MembershipPurchaseStatusResponse
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
  opts?: { inviteCode?: string; deviceFingerprint?: string },
): Promise<{
  token: string
  refreshToken: string | null
  email: string
  membershipExpiresAt: string | null
  phone: string | null
  welcomeMembershipClaimed: boolean
  invitedByBound: boolean
}> {
  const body: Record<string, string> = {
    accessToken: accessToken.trim(),
  }
  if (opts?.inviteCode?.trim()) body.inviteCode = opts.inviteCode.trim()
  if (opts?.deviceFingerprint?.trim()) {
    body.deviceFingerprint = opts.deviceFingerprint.trim()
  }
  const res = await fetch(`${base.replace(/\/$/, '')}/auth/oneclick/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await parseErr(res))
  return mapLoginResult((await res.json()) as LoginJson)
}

export async function apiSmsLogin(
  base: string,
  phone: string,
  code: string,
  opts?: { inviteCode?: string; deviceFingerprint?: string },
): Promise<{
  token: string
  refreshToken: string | null
  email: string
  membershipExpiresAt: string | null
  phone: string | null
  welcomeMembershipClaimed: boolean
  invitedByBound: boolean
}> {
  const body: Record<string, string> = {
    phone: phone.trim(),
    code: code.trim(),
  }
  if (opts?.inviteCode?.trim()) body.inviteCode = opts.inviteCode.trim()
  if (opts?.deviceFingerprint?.trim()) {
    body.deviceFingerprint = opts.deviceFingerprint.trim()
  }
  const res = await fetch(`${base.replace(/\/$/, '')}/auth/sms/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await parseErr(res))
  return mapLoginResult((await res.json()) as LoginJson)
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
  customerCatalog?: CustomerEntry[]
  customerCatalogSuppressed?: string[]
}

export type LedgerApiResponse = LedgerPayload & {
  updatedAt?: string
}

export type ApiHealth = {
  ok: boolean
  smsLogin?: boolean
  oneClickLogin?: boolean
  alipayPay?: boolean
  alipaySandbox?: boolean
  alipayAppId?: string
  alipayWarnings?: string[]
}

export type MembershipPlanId = 'monthly' | 'quarterly' | 'yearly'

export type MembershipPlanInfo = {
  id: MembershipPlanId
  label: string
  priceYuan: string
  grantedDays: number
}

export type MembershipPlansResponse = {
  plans: MembershipPlanInfo[]
  alipayReady: boolean
  alipaySandbox?: boolean
  alipayAppId?: string
  alipayWarnings?: string[]
}

export type AlipayPayDebugInfo = {
  serverAppId: string
  sandbox: boolean
  gateway: string
  keyType: 'PKCS1' | 'PKCS8'
  notifyUrl: string
  warnings: string[]
  orderStringLen: number
  orderAppId: string | null
  method: string | null
  signPresent: boolean
  signLen: number
  timestamp: string | null
  bizOutTradeNo: string | null
  bizTotal: string | null
  bizProductCode: string | null
  orderStringPreview: string
}

export type MembershipPurchaseCreateResponse = {
  outTradeNo: string
  orderString: string
  planId: MembershipPlanId
  amountYuan: string
  subject: string
  sandbox: boolean
  payDebug?: AlipayPayDebugInfo
}

export type MembershipPurchaseStatusResponse = {
  outTradeNo: string
  status: string
  planId: MembershipPlanId
  amountYuan: string
  paidAt: string | null
  membershipExpiresAt: string | null
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
  refreshToken: string | null
  email: string
  membershipExpiresAt: string | null
  phone: string | null
  welcomeMembershipClaimed: boolean
  invitedByBound: boolean
}> {
  const res = await fetch(`${base.replace(/\/$/, '')}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(await parseErr(res))
  return mapLoginResult((await res.json()) as LoginJson)
}

export async function apiRegister(
  base: string,
  email: string,
  password: string,
): Promise<{
  token: string
  refreshToken: string | null
  email: string
  membershipExpiresAt: string | null
  phone: string | null
  welcomeMembershipClaimed: boolean
  invitedByBound: boolean
}> {
  const res = await fetch(`${base.replace(/\/$/, '')}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(await parseErr(res))
  return mapLoginResult((await res.json()) as LoginJson)
}

export async function fetchLedger(
  base: string,
  token: string,
): Promise<LedgerApiResponse> {
  const res = await fetchAuthed(
    base,
    '/api/ledger',
    {},
    { token },
  )
  if (!res.ok) throw new Error(await parseErr(res))
  return (await res.json()) as LedgerApiResponse
}

export async function putLedger(
  base: string,
  token: string,
  payload: LedgerPayload,
): Promise<LedgerApiResponse> {
  const res = await fetchAuthed(
    base,
    '/api/ledger',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    { token },
  )
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
  const res = await fetchAuthed(
    base,
    '/api/voice/parse',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        fields,
        productCatalog: catalogOpts?.productCatalog,
        productCatalogPromptSection:
          catalogOpts?.productCatalogPromptSection,
      }),
    },
    { token },
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

export type BillLedgerParseResponse = {
  result: DoubaoParseResult
  httpStatus: number
}

/** 账单图片 → 结构化字段（走服务端 /api/bill/parse） */
export async function parseBillLedger(
  base: string,
  token: string,
  imageBase64: string,
  mimeType: string,
  fields: Array<{ id: string; name: string; key?: string }>,
  catalogOpts?: {
    productCatalog?: string[]
    productCatalogPromptSection?: string
    signal?: AbortSignal
  },
): Promise<BillLedgerParseResponse> {
  const res = await fetchAuthed(
    base,
    '/api/bill/parse',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64,
        mimeType,
        fields,
        productCatalog: catalogOpts?.productCatalog,
        productCatalogPromptSection:
          catalogOpts?.productCatalogPromptSection,
      }),
    },
    { token, timeoutMs: 60_000, externalSignal: catalogOpts?.signal },
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

export type FeedbackCategory = 'bug' | 'feature' | 'other'

/** 用户意见反馈（登录可选；有 token 时会关联账号） */
export async function submitFeedback(
  base: string,
  payload: {
    category: FeedbackCategory
    content: string
    contact?: string
    appVersion?: string
    platform?: string
  },
  token?: string | null,
): Promise<{ ok: true }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const res = token
    ? await fetchAuthed(
        base,
        '/api/feedback',
        {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        },
        { token },
      )
    : await fetch(`${base.replace(/\/$/, '')}/api/feedback`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })
  if (!res.ok) throw new Error(await parseErr(res))
  return (await res.json()) as { ok: true }
}
