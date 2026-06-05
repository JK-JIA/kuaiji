import type { FieldDef, LedgerRecord, ProductCatalogEntry, CustomerEntry } from '../types'
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

export async function cancelMembership(
  base: string,
  token: string,
): Promise<MeResponse> {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/membership/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(await parseErr(res))
  return (await res.json()) as MeResponse
}

export async function fetchReferralMe(
  base: string,
  token: string,
): Promise<ReferralMeResponse> {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/referral/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(await parseErr(res))
  return (await res.json()) as ReferralMeResponse
}

export async function bindReferralCode(
  base: string,
  token: string,
  code: string,
): Promise<ReferralBindResponse> {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/referral/bind`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code: code.trim() }),
  })
  if (!res.ok) throw new Error(await parseErr(res))
  return (await res.json()) as ReferralBindResponse
}

export async function completeReferralReward(
  base: string,
  token: string,
): Promise<ReferralCompleteResponse> {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/referral/complete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) throw new Error(await parseErr(res))
  return (await res.json()) as ReferralCompleteResponse
}

export async function ackReferralNotices(
  base: string,
  token: string,
  ids: string[],
): Promise<void> {
  const res = await fetch(
    `${base.replace(/\/$/, '')}/api/referral/notices/ack`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids }),
    },
  )
  if (!res.ok) throw new Error(await parseErr(res))
}

/** 新用户优惠：免费领取 1 个月会员（每账号一次） */
export async function claimWelcomeMembership(
  base: string,
  token: string,
): Promise<MeResponse> {
  const res = await fetch(
    `${base.replace(/\/$/, '')}/api/membership/claim-welcome`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
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
  const res = await fetch(
    `${base.replace(/\/$/, '')}/api/membership/purchase/create`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ planId }),
    },
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
  const res = await fetch(
    `${base.replace(/\/$/, '')}/api/membership/purchase/status?${q}`,
    { headers: { Authorization: `Bearer ${token}` } },
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
  const j = (await res.json()) as {
    token: string
    user: AuthUserPayload
  }
  return {
    token: j.token,
    ...mapAuthUser(j.user),
  }
}

export async function apiSmsLogin(
  base: string,
  phone: string,
  code: string,
  opts?: { inviteCode?: string; deviceFingerprint?: string },
): Promise<{
  token: string
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
  const j = (await res.json()) as {
    token: string
    user: AuthUserPayload
  }
  return {
    token: j.token,
    ...mapAuthUser(j.user),
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
  const j = (await res.json()) as {
    token: string
    user: AuthUserPayload
  }
  return {
    token: j.token,
    ...mapAuthUser(j.user),
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
  welcomeMembershipClaimed: boolean
  invitedByBound: boolean
}> {
  const res = await fetch(`${base.replace(/\/$/, '')}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(await parseErr(res))
  const j = (await res.json()) as {
    token: string
    user: AuthUserPayload
  }
  return {
    token: j.token,
    ...mapAuthUser(j.user),
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
  const res = await fetchWithTimeout(
    `${base.replace(/\/$/, '')}/api/bill/parse`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageBase64,
        mimeType,
        fields,
        productCatalog: catalogOpts?.productCatalog,
        productCatalogPromptSection:
          catalogOpts?.productCatalogPromptSection,
      }),
    },
    60_000,
    catalogOpts?.signal,
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
