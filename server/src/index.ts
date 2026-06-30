import { randomBytes } from 'crypto'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import cors from 'cors'
import express from 'express'
import http from 'http'
import { z } from 'zod'
import {
  aliyunOneClickConfigured,
  getPhoneFromAccessToken,
} from './aliyunOneClick.js'
import {
  aliyunSmsConfigured,
  sendAliyunSmsVerifyCode,
  verifyAliyunSmsCode,
} from './aliyunSms.js'
import {
  issueAuthTokens,
  userIdForTokenRefresh,
  userIdFromAccessToken,
} from './authTokens.js'
import {
  attachAsrWebSocket,
  volcAsrEnvReady,
  xfyunAsrEnvReady,
} from './asrStream.js'
import { getVolcAsrResourceId } from './volcAsrUpstream.js'
import {
  doubaoEnvReady,
  getVoiceParseModelId,
  parseVoiceOnServer,
  voiceParseModelReady,
} from './voiceParse.js'
import {
  billParseModelReady,
  getBillParseModelId,
  parseBillImageOnServer,
} from './billParse.js'
import {
  alipayAppId,
  alipayConfigWarnings,
  alipayEnvReady,
  alipaySandboxMode,
} from './alipay.js'
import {
  assertAlipayConfigReady,
  createMembershipPurchaseOrder,
  getMembershipPurchaseOrder,
  handleAlipayNotify,
  markMembershipOrderPaidFromClient,
  membershipAlipayMeta,
  membershipPlansJson,
} from './membershipPayment.js'
import {
  buildSiteAdminOverview,
  siteAdminAuthOk,
  siteAdminReady,
} from './siteAdmin.js'
import {
  ackInviterNotices,
  attachReferralOnRegister,
  bindReferralInvite,
  buildInviteDownloadUrl,
  completeReferralOnFirstRecord,
  ensureUserInviteCode,
  generateInviteCode,
  listInviterNotices,
  REFERRAL_MAX_REWARD_MONTHS,
  referralAttachErrorMessage,
  referralBindErrorMessage,
} from './referral.js'

const prisma = new PrismaClient()

/** 与 ensureDefaultAdmin、永久兑换码一致 */
const MEMBERSHIP_FAR_END = new Date('2099-12-31T15:59:59.000Z')
/** 新用户登录后可免费领取的会员天数（每账号一次） */
const WELCOME_MEMBERSHIP_DAYS = 30

const PORT = Number(process.env.PORT) || 3001
const JWT_SECRET =
  process.env.JWT_SECRET ?? 'dev-only-change-JWT_SECRET-in-production-min-32-chars'
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? '*'
const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(128),
})

const LoginSchema = z.object({
  email: z.string().min(1).max(191),
  password: z.string().min(6).max(128),
})

const LedgerPutSchema = z.object({
  fields: z.array(z.unknown()),
  records: z.array(z.unknown()),
  productCatalog: z.array(z.unknown()).optional(),
  productCatalogSuppressed: z.array(z.string()).optional(),
  customerCatalog: z.array(z.unknown()).optional(),
  customerCatalogSuppressed: z.array(z.string()).optional(),
  voiceProductCorrections: z.array(z.unknown()).optional(),
  asrHotwordsSuppressed: z.array(z.string()).optional(),
})

function jsonArrayUnknown(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : []
}

function jsonStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is string => typeof x === 'string')
}

const SmsSendSchema = z.object({
  phone: z.string().min(10).max(20),
})

const SmsLoginSchema = z.object({
  phone: z.string().min(10).max(20),
  code: z.string().min(4).max(12),
  inviteCode: z.string().max(32).optional(),
  deviceFingerprint: z.string().max(128).optional(),
})

const OneClickLoginSchema = z.object({
  accessToken: z.string().min(8).max(4096),
  inviteCode: z.string().max(32).optional(),
  deviceFingerprint: z.string().max(128).optional(),
})

const RefreshSchema = z.object({
  refreshToken: z.string().min(10).max(4096).optional(),
})

const RedeemSchema = z.object({
  code: z.string().min(4).max(64),
})

const PurchaseCreateSchema = z.object({
  planId: z.enum(['monthly', 'quarterly', 'yearly']),
})

const PurchaseStatusSchema = z.object({
  outTradeNo: z.string().min(8).max(64),
})

const VoiceParseSchema = z.object({
  text: z.string().min(1).max(8000),
  fields: z.array(
    z.object({
      id: z.string().min(1).max(128),
      name: z.string().min(1).max(128),
      key: z.string().max(64).optional(),
    }),
  ),
  productCatalog: z.array(z.string().min(1).max(120)).max(300).optional(),
  productCatalogPromptSection: z.string().max(12_000).optional(),
})

const BillParseSchema = z.object({
  imageBase64: z.string().min(100).max(4_000_000),
  mimeType: z
    .enum(['image/jpeg', 'image/png', 'image/webp', 'image/jpg'])
    .optional(),
  fields: z.array(
    z.object({
      id: z.string().min(1).max(128),
      name: z.string().min(1).max(128),
      key: z.string().max(64).optional(),
    }),
  ),
  productCatalog: z.array(z.string().min(1).max(120)).max(300).optional(),
  productCatalogPromptSection: z.string().max(12_000).optional(),
})

const lastSmsSend = new Map<string, number>()
const lastFeedbackByIp = new Map<string, number[]>()

const FEEDBACK_CATEGORIES = ['bug', 'feature', 'other'] as const

const FeedbackSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  content: z.string().trim().min(5).max(5000),
  contact: z.string().trim().max(120).optional(),
  appVersion: z.string().trim().max(32).optional(),
  platform: z.string().trim().max(32).optional(),
})

function clientIp(req: express.Request): string {
  const xf = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim()
  return xf || req.socket.remoteAddress || 'unknown'
}

function feedbackRateLimited(ip: string): boolean {
  const now = Date.now()
  const windowMs = 60 * 60 * 1000
  const maxPerHour = 6
  const prev = (lastFeedbackByIp.get(ip) || []).filter((t) => now - t < windowMs)
  if (prev.length >= maxPerHour) return true
  prev.push(now)
  lastFeedbackByIp.set(ip, prev)
  return false
}

function authHeader(req: express.Request): string | null {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) return null
  return h.slice(7).trim() || null
}

function userIdFromToken(token: string): string | null {
  return userIdFromAccessToken(token, JWT_SECRET)
}

function normalizeCnPhone(raw: string): string | null {
  const s = raw.replace(/\s+/g, '')
  if (/^1\d{10}$/.test(s)) return s
  return null
}

/** 日志脱敏：138****8000 */
function maskPhone11(phone: string): string {
  if (phone.length !== 11) return '***'
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`
}

function smsEmailForPhone(phone: string): string {
  return `${phone}@sms.kuaiji.local`
}

function membershipActive(
  expires: Date | null | undefined,
): expires is Date {
  return expires != null && expires.getTime() > Date.now()
}

function userJson(user: {
  id: string
  email: string
  phone: string | null
  membershipExpiresAt: Date | null
  welcomeMembershipClaimedAt?: Date | null
  inviteCode?: string | null
  invitedByUserId?: string | null
  referralRewardMonths?: number
}) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    membershipExpiresAt: user.membershipExpiresAt?.toISOString() ?? null,
    welcomeMembershipClaimed: Boolean(user.welcomeMembershipClaimedAt),
    inviteCode: user.inviteCode ?? null,
    invitedByBound: Boolean(user.invitedByUserId),
    referralRewardMonths: user.referralRewardMonths ?? 0,
  }
}

function extendMembershipExpires(
  current: Date | null | undefined,
  grantedDays: number,
): Date {
  const now = new Date()
  const base =
    membershipActive(current) && current ? current : now
  return new Date(base.getTime() + grantedDays * 24 * 60 * 60 * 1000)
}

async function loginOrRegisterByPhone(
  phone: string,
  opts?: { inviteCode?: string; deviceFingerprint?: string },
) {
  const email = smsEmailForPhone(phone)
  let user = await prisma.user.findFirst({
    where: { OR: [{ phone }, { email }] },
  })
  let isNewUser = false

  if (!user) {
    isNewUser = true
    const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 10)
    let created = false
    for (let attempt = 0; attempt < 12 && !created; attempt++) {
      try {
        user = await prisma.user.create({
          data: {
            email,
            phone,
            phoneVerifiedAt: new Date(),
            passwordHash,
            membershipExpiresAt: null,
            inviteCode: generateInviteCode(),
            ledger: {
              create: {
                fieldsJson: [],
                recordsJson: [],
              },
            },
          },
        })
        created = true
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        if (!msg.includes('Unique constraint') || !msg.includes('inviteCode')) {
          throw e
        }
      }
    }
    if (!created || !user) {
      throw new Error('用户注册失败')
    }
    if (opts?.deviceFingerprint?.trim()) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { deviceFingerprint: opts.deviceFingerprint.trim() },
      })
    }
    if (opts?.inviteCode?.trim()) {
      const attach = await attachReferralOnRegister(
        prisma,
        user.id,
        opts.inviteCode,
        opts.deviceFingerprint,
      )
      if (!attach.ok && attach.error !== 'ALREADY_INVITED') {
        console.warn(
          '[referral] register attach skipped',
          phone.slice(0, 3) + '****',
          attach.error,
        )
      } else if (attach.ok) {
        user = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
      }
    }
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { phone, phoneVerifiedAt: new Date() },
    })
  }

  const { token, refreshToken } = issueAuthTokens(user.id, JWT_SECRET)
  return { token, refreshToken, user, isNewUser }
}

const app = express()
app.use(
  cors({
    origin: FRONTEND_ORIGIN === '*' ? true : FRONTEND_ORIGIN,
    credentials: true,
  }),
)
app.use(express.json({ limit: '8mb' }))

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    smsLogin: true,
    oneClickLogin: true,
    alipayPay: alipayEnvReady(),
    alipaySandbox: alipaySandboxMode(),
    alipayAppId: alipayAppId() || undefined,
    alipayWarnings: alipayConfigWarnings(),
    siteAdmin: siteAdminReady(),
  })
})

/** 官网管理后台：使用情况、购买记录、会员有效期（Bearer WEBSITE_ADMIN_TOKEN） */
app.get('/api/site-admin/overview', async (req, res) => {
  if (!siteAdminReady()) {
    res.status(503).json({ error: '未配置 WEBSITE_ADMIN_TOKEN' })
    return
  }
  if (!siteAdminAuthOk(req.headers.authorization)) {
    res.status(401).json({ error: '无效或缺少管理令牌' })
    return
  }
  try {
    const overview = await buildSiteAdminOverview(prisma)
    res.json(overview)
  } catch (e) {
    console.error('[site-admin]', e)
    res.status(500).json({
      error: e instanceof Error ? e.message : '服务器错误',
    })
  }
})

/** 私发 APK 应用内更新：公开接口，无需登录；未配置环境变量时返回 enabled: false */
app.get('/api/app/android-latest', (_req, res) => {
  const codeRaw = process.env.ANDROID_UPDATE_VERSION_CODE?.trim()
  const urlRaw = process.env.ANDROID_UPDATE_APK_URL?.trim()
  if (!codeRaw || !urlRaw) {
    res.json({ enabled: false as const })
    return
  }
  const versionCode = parseInt(codeRaw, 10)
  if (!Number.isFinite(versionCode) || versionCode < 1) {
    res.json({ enabled: false as const })
    return
  }
  res.json({
    enabled: true as const,
    versionCode,
    versionName: process.env.ANDROID_UPDATE_VERSION_NAME?.trim() ?? '',
    apkUrl: urlRaw,
    releaseNotes: process.env.ANDROID_UPDATE_NOTES?.trim() ?? '',
  })
})

app.get('/api/asr/health', (_req, res) => {
  res.json({
    ok: true,
    volcAsrEnvReady: volcAsrEnvReady(),
    xfyunAsrEnvReady: xfyunAsrEnvReady(),
    doubaoEnvReady: doubaoEnvReady(),
    voiceParseModelReady: voiceParseModelReady(),
    billParseModelReady: billParseModelReady(),
    /** 语音转文字后智能解析（商品/数量等）所用豆包模型 */
    voiceParseModel: getVoiceParseModelId(),
    /** 图片账单识别所用视觉模型 */
    billParseModel: getBillParseModelId(),
    /** 豆包流式 ASR 资源 ID（非 LLM 模型） */
    volcAsrResourceId: getVolcAsrResourceId(),
    websocketPaths: {
      volc: '/api/asr/stream',
      xfyun: '/api/asr/xfyun/stream',
    },
    handshakeNotes:
      'After WS connect, send first text JSON: type auth + JWT token field',
    node: process.version,
  })
})

app.post('/api/voice/parse', async (req, res) => {
  const token = authHeader(req)
  if (!token) {
    res.status(401).json({ success: false, error: '未登录' })
    return
  }
  const userId = userIdFromToken(token)
  if (!userId) {
    res.status(401).json({ success: false, error: '无效令牌' })
    return
  }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || !membershipActive(user.membershipExpiresAt)) {
    res.status(403).json({
      success: false,
      error: '需要有效会员才能使用智能识别',
      code: 'membership_required',
    })
    return
  }
  const parsed = VoiceParseSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: '请求体须包含 text 与 fields' })
    return
  }
  if (!doubaoEnvReady()) {
    res.status(503).json({
      success: false,
      error: '智能解析服务暂未开通，请稍后再试。',
    })
    return
  }
  if (!voiceParseModelReady()) {
    res.status(503).json({
      success: false,
      error: '智能解析服务暂未开通，请稍后再试。',
    })
    return
  }
  try {
    const result = await parseVoiceOnServer(
      parsed.data.text,
      parsed.data.fields,
      {
        productCatalog: parsed.data.productCatalog,
        productCatalogPromptSection:
          parsed.data.productCatalogPromptSection,
      },
    )
    res.status(result.success ? 200 : 502).json(result)
  } catch (e) {
    console.error('[ledger-api][voice/parse]', e)
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : '解析服务异常',
    })
  }
})

app.post('/api/bill/parse', async (req, res) => {
  const token = authHeader(req)
  if (!token) {
    res.status(401).json({ success: false, error: '未登录' })
    return
  }
  const userId = userIdFromToken(token)
  if (!userId) {
    res.status(401).json({ success: false, error: '无效令牌' })
    return
  }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || !membershipActive(user.membershipExpiresAt)) {
    res.status(403).json({
      success: false,
      error: '需要有效会员才能使用图片识别',
      code: 'membership_required',
    })
    return
  }
  const parsed = BillParseSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: '请求体须包含 imageBase64 与 fields' })
    return
  }
  if (!doubaoEnvReady()) {
    res.status(503).json({
      success: false,
      error: '图片识别服务暂未开通，请稍后再试。',
    })
    return
  }
  if (!billParseModelReady()) {
    res.status(503).json({
      success: false,
      error: '图片识别服务暂未开通，请稍后再试。',
    })
    return
  }
  try {
    const mime =
      parsed.data.mimeType === 'image/jpg'
        ? 'image/jpeg'
        : parsed.data.mimeType ?? 'image/jpeg'
    const result = await parseBillImageOnServer(
      parsed.data.imageBase64,
      mime,
      parsed.data.fields,
      {
        productCatalog: parsed.data.productCatalog,
        productCatalogPromptSection:
          parsed.data.productCatalogPromptSection,
      },
    )
    res.status(result.success ? 200 : 502).json(result)
  } catch (e) {
    console.error('[ledger-api][bill/parse]', e)
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : '解析服务异常',
    })
  }
})

app.post('/auth/register', async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: '邮箱或密码格式无效' })
    return
  }
  const { email, password } = parsed.data
  const exists = await prisma.user.findUnique({ where: { email } })
  if (exists) {
    res.status(409).json({ error: '该邮箱已注册' })
    return
  }
  const passwordHash = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      membershipExpiresAt: null,
      inviteCode: generateInviteCode(),
      ledger: {
        create: {
          fieldsJson: [],
          recordsJson: [],
        },
      },
    },
  })
  const { token, refreshToken } = issueAuthTokens(user.id, JWT_SECRET)
  res.status(201).json({
    token,
    refreshToken,
    user: userJson(user),
  })
})

app.post('/auth/login', async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: '账号或密码格式无效（密码至少 6 位）' })
    return
  }
  const { email, password } = parsed.data
  const user = await prisma.user.findUnique({ where: { email: email.trim() } })
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: '账号或密码错误' })
    return
  }
  const { token, refreshToken } = issueAuthTokens(user.id, JWT_SECRET)
  res.json({
    token,
    refreshToken,
    user: userJson(user),
  })
})

app.post('/auth/refresh', async (req, res) => {
  const parsed = RefreshSchema.safeParse(req.body ?? {})
  const refreshToken = parsed.success ? parsed.data.refreshToken : undefined
  const accessToken = authHeader(req)

  const userId = userIdForTokenRefresh({
    refreshToken,
    accessToken,
    jwtSecret: JWT_SECRET,
  })
  if (!userId) {
    res.status(401).json({ error: '无效令牌' })
    return
  }

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    res.status(404).json({ error: '用户不存在' })
    return
  }

  const tokens = issueAuthTokens(user.id, JWT_SECRET)
  res.json({
    token: tokens.token,
    refreshToken: tokens.refreshToken,
    user: userJson(user),
  })
})

app.post('/auth/sms/send', async (req, res) => {
  const parsed = SmsSendSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: '手机号格式无效' })
    return
  }
  const phone = normalizeCnPhone(parsed.data.phone)
  if (!phone) {
    res.status(400).json({ error: '请输入中国大陆 11 位手机号' })
    return
  }
  const now = Date.now()
  const prev = lastSmsSend.get(phone) ?? 0
  if (now - prev < 55_000) {
    console.warn('[sms] rate_limited', maskPhone11(phone))
    res.status(429).json({ error: '发送过于频繁，请稍后再试' })
    return
  }
  lastSmsSend.set(phone, now)

  try {
    if (!aliyunSmsConfigured()) {
      console.warn('[sms] skip send: Aliyun AK not configured')
      res.status(503).json({
        error:
          '未配置 ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET，无法发送短信',
      })
      return
    }
    console.log('[sms] send start', maskPhone11(phone))
    await sendAliyunSmsVerifyCode(phone)
    console.log('[sms] send http ok', maskPhone11(phone))
  } catch (e) {
    const msg = e instanceof Error ? e.message : '短信发送失败'
    console.error('[sms] send failed', maskPhone11(phone), msg)
    res.status(502).json({ error: msg })
    return
  }

  res.json({ ok: true })
})

app.post('/auth/sms/login', async (req, res) => {
  const parsed = SmsLoginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: '手机号或验证码无效' })
    return
  }
  const phone = normalizeCnPhone(parsed.data.phone)
  if (!phone) {
    res.status(400).json({ error: '手机号格式无效' })
    return
  }
  const { code } = parsed.data

  if (!aliyunSmsConfigured()) {
    res.status(503).json({ error: '服务端未配置阿里云短信密钥' })
    return
  }
  const ok = await verifyAliyunSmsCode(phone, code)
  if (!ok) {
    res.status(401).json({ error: '验证码无效或已过期' })
    return
  }

  const { inviteCode, deviceFingerprint } = parsed.data
  const { token, refreshToken, user } = await loginOrRegisterByPhone(phone, {
    inviteCode,
    deviceFingerprint,
  })
  res.json({
    token,
    refreshToken,
    user: userJson(user),
  })
})

app.post('/auth/oneclick/login', async (req, res) => {
  const parsed = OneClickLoginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'accessToken 无效' })
    return
  }

  if (!aliyunOneClickConfigured()) {
    res.status(503).json({ error: '服务端未配置阿里云 AccessKey' })
    return
  }

  let phone: string
  try {
    phone = await getPhoneFromAccessToken(parsed.data.accessToken)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '取号失败'
    console.error('[oneclick] GetMobile failed', msg)
    res.status(401).json({ error: msg })
    return
  }

  const normalized = normalizeCnPhone(phone)
  if (!normalized) {
    res.status(400).json({ error: '手机号格式无效' })
    return
  }

  console.log('[oneclick] login ok', maskPhone11(normalized))
  const { inviteCode, deviceFingerprint } = parsed.data
  const { token, refreshToken, user } = await loginOrRegisterByPhone(normalized, {
    inviteCode,
    deviceFingerprint,
  })
  res.json({
    token,
    refreshToken,
    user: userJson(user),
  })
})

app.get('/api/me', async (req, res) => {
  const token = authHeader(req)
  if (!token) {
    res.status(401).json({ error: '未登录' })
    return
  }
  const userId = userIdFromToken(token)
  if (!userId) {
    res.status(401).json({ error: '无效令牌' })
    return
  }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    res.status(404).json({ error: '用户不存在' })
    return
  }
  res.json(userJson(user))
})

app.post('/api/feedback', async (req, res) => {
  const ip = clientIp(req)
  if (feedbackRateLimited(ip)) {
    res.status(429).json({ error: '提交过于频繁，请稍后再试' })
    return
  }

  const parsed = FeedbackSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: '请填写有效的反馈内容' })
    return
  }

  let userId: string | null = null
  const token = authHeader(req)
  if (token) {
    userId = userIdFromToken(token)
  }

  const { category, content, contact, appVersion, platform } = parsed.data
  try {
    await prisma.userFeedback.create({
      data: {
        userId,
        category,
        content,
        contact: contact?.trim() || null,
        appVersion: appVersion?.trim() || null,
        platform: platform?.trim() || null,
      },
    })
    res.json({ ok: true })
  } catch (e) {
    console.error('[feedback]', e)
    res.status(500).json({
      error: e instanceof Error ? e.message : '提交失败，请稍后重试',
    })
  }
})

const ReferralBindSchema = z.object({
  code: z.string().min(1).max(32),
})

app.get('/api/referral/me', async (req, res) => {
  const token = authHeader(req)
  if (!token) {
    res.status(401).json({ error: '未登录' })
    return
  }
  const userId = userIdFromToken(token)
  if (!userId) {
    res.status(401).json({ error: '无效令牌' })
    return
  }
  try {
    const inviteCode = await ensureUserInviteCode(prisma, userId)
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    const inviteCount = await prisma.referral.count({
      where: { inviterId: userId, status: 'completed' },
    })
    const notices = await listInviterNotices(prisma, userId)
    res.json({
      inviteCode,
      inviteUrl: buildInviteDownloadUrl(inviteCode),
      referralRewardMonths: user.referralRewardMonths,
      referralMaxRewardMonths: REFERRAL_MAX_REWARD_MONTHS,
      inviteCount,
      invitedByBound: Boolean(user.invitedByUserId),
      canEarnMoreReferral:
        user.referralRewardMonths < REFERRAL_MAX_REWARD_MONTHS,
      notices,
    })
  } catch (e) {
    console.error('[referral/me]', e)
    res.status(500).json({ error: '获取邀请信息失败' })
  }
})

app.post('/api/referral/bind', async (req, res) => {
  const token = authHeader(req)
  if (!token) {
    res.status(401).json({ error: '未登录' })
    return
  }
  const userId = userIdFromToken(token)
  if (!userId) {
    res.status(401).json({ error: '无效令牌' })
    return
  }
  const parsed = ReferralBindSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: '邀请码格式无效' })
    return
  }
  try {
    const result = await bindReferralInvite(
      prisma,
      userId,
      parsed.data.code,
      extendMembershipExpires,
    )
    if (!result.ok) {
      res.status(400).json({ error: referralBindErrorMessage(result.error) })
      return
    }
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    res.json({
      ok: true,
      inviterRewarded: result.inviterRewarded,
      user: userJson(user),
    })
  } catch (e) {
    console.error('[referral/bind]', e)
    res.status(500).json({ error: '绑定邀请码失败' })
  }
})

const ReferralNoticeAckSchema = z.object({
  ids: z.array(z.string().min(1).max(64)),
})

app.post('/api/referral/notices/ack', async (req, res) => {
  const token = authHeader(req)
  if (!token) {
    res.status(401).json({ error: '未登录' })
    return
  }
  const userId = userIdFromToken(token)
  if (!userId) {
    res.status(401).json({ error: '无效令牌' })
    return
  }
  const parsed = ReferralNoticeAckSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: '参数无效' })
    return
  }
  try {
    await ackInviterNotices(prisma, userId, parsed.data.ids)
    res.json({ ok: true })
  } catch (e) {
    console.error('[referral/notices/ack]', e)
    res.status(500).json({ error: '确认通知失败' })
  }
})

app.post('/api/referral/complete', async (req, res) => {
  const token = authHeader(req)
  if (!token) {
    res.status(401).json({ error: '未登录' })
    return
  }
  const userId = userIdFromToken(token)
  if (!userId) {
    res.status(401).json({ error: '无效令牌' })
    return
  }
  try {
    const result = await completeReferralOnFirstRecord(
      prisma,
      userId,
      extendMembershipExpires,
    )
    if (!result.ok) {
      res.status(400).json({ error: '邀请奖励已领取' })
      return
    }
    if (!result.completed) {
      res.json({ ok: true, completed: false })
      return
    }
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    res.json({
      ok: true,
      completed: true,
      inviteeRewarded: result.inviteeRewarded,
      inviteeMessage: result.inviteeRewarded
        ? '你通过好友邀请加入，已获得 1 个月会员体验'
        : null,
      user: userJson(user),
    })
  } catch (e) {
    console.error('[referral/complete]', e)
    res.status(500).json({ error: '领取邀请奖励失败' })
  }
})

app.get('/api/membership/plans', (_req, res) => {
  res.json({
    plans: membershipPlansJson(),
    ...membershipAlipayMeta(),
  })
})

app.post('/api/membership/purchase/create', async (req, res) => {
  const token = authHeader(req)
  if (!token) {
    res.status(401).json({ error: '未登录' })
    return
  }
  const userId = userIdFromToken(token)
  if (!userId) {
    res.status(401).json({ error: '无效令牌' })
    return
  }
  if (!alipayEnvReady()) {
    res.status(503).json({ error: '服务端未配置支付宝支付' })
    return
  }
  const configWarnings = alipayConfigWarnings()
  if (configWarnings.length > 0) {
    res.status(503).json({ error: configWarnings[0] })
    return
  }
  const parsed = PurchaseCreateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: '无效的会员套餐' })
    return
  }
  try {
    assertAlipayConfigReady()
    const { order, orderString, sandbox, payDebug } =
      await createMembershipPurchaseOrder(prisma, userId, parsed.data.planId)
    res.json({
      outTradeNo: order.outTradeNo,
      orderString,
      planId: order.planId,
      amountYuan: order.amountYuan,
      subject: order.subject,
      sandbox,
      payDebug,
    })
  } catch (e) {
    console.error('[ledger-api][membership/purchase/create]', e)
    const msg = e instanceof Error ? e.message : ''
    if (msg.startsWith('ALIPAY_CONFIG_MISMATCH:')) {
      res.status(503).json({ error: msg.slice('ALIPAY_CONFIG_MISMATCH:'.length) })
      return
    }
    res.status(500).json({ error: '创建支付订单失败' })
  }
})

app.get('/api/membership/purchase/status', async (req, res) => {
  const token = authHeader(req)
  if (!token) {
    res.status(401).json({ error: '未登录' })
    return
  }
  const userId = userIdFromToken(token)
  if (!userId) {
    res.status(401).json({ error: '无效令牌' })
    return
  }
  const parsed = PurchaseStatusSchema.safeParse({
    outTradeNo: req.query.outTradeNo,
  })
  if (!parsed.success) {
    res.status(400).json({ error: '缺少订单号' })
    return
  }
  let order = await getMembershipPurchaseOrder(
    prisma,
    userId,
    parsed.data.outTradeNo,
  )
  if (!order) {
    res.status(404).json({ error: '订单不存在' })
    return
  }
  if (order.status !== 'paid' && alipayEnvReady()) {
    order =
      (await markMembershipOrderPaidFromClient(
        prisma,
        userId,
        parsed.data.outTradeNo,
      )) ?? order
  }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  res.json({
    outTradeNo: order.outTradeNo,
    status: order.status,
    planId: order.planId,
    amountYuan: order.amountYuan,
    paidAt: order.paidAt?.toISOString() ?? null,
    membershipExpiresAt: user?.membershipExpiresAt?.toISOString() ?? null,
  })
})

app.post(
  '/api/payment/alipay/notify',
  express.urlencoded({ extended: false }),
  async (req, res) => {
    try {
      const result = await handleAlipayNotify(
        prisma,
        req.body as Record<string, string>,
      )
      res.type('text/plain').send(result)
    } catch (e) {
      console.error('[ledger-api][alipay-notify]', e)
      res.type('text/plain').send('fail')
    }
  },
)

/** 清除当前账号会员（用于联调/测试；不退款） */
app.post('/api/membership/cancel', async (req, res) => {
  const token = authHeader(req)
  if (!token) {
    res.status(401).json({ error: '未登录' })
    return
  }
  const userId = userIdFromToken(token)
  if (!userId) {
    res.status(401).json({ error: '无效令牌' })
    return
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: { membershipExpiresAt: null },
  })
  res.json(userJson(user))
})

app.post('/api/membership/claim-welcome', async (req, res) => {
  const token = authHeader(req)
  if (!token) {
    res.status(401).json({ error: '未登录' })
    return
  }
  const userId = userIdFromToken(token)
  if (!userId) {
    res.status(401).json({ error: '无效令牌' })
    return
  }
  try {
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.findUniqueOrThrow({ where: { id: userId } })
      if (u.welcomeMembershipClaimedAt) {
        throw new Error('WELCOME_ALREADY_CLAIMED')
      }
      const now = new Date()
      return tx.user.update({
        where: { id: userId },
        data: {
          welcomeMembershipClaimedAt: now,
          membershipExpiresAt: extendMembershipExpires(
            u.membershipExpiresAt,
            WELCOME_MEMBERSHIP_DAYS,
          ),
        },
      })
    })
    res.json(userJson(user))
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'WELCOME_ALREADY_CLAIMED') {
      res.status(400).json({ error: '新用户优惠已领取过' })
      return
    }
    throw e
  }
})

app.post('/api/membership/redeem', async (req, res) => {
  const token = authHeader(req)
  if (!token) {
    res.status(401).json({ error: '未登录' })
    return
  }
  const userId = userIdFromToken(token)
  if (!userId) {
    res.status(401).json({ error: '无效令牌' })
    return
  }
  const parsed = RedeemSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: '兑换码格式无效' })
    return
  }
  const raw = parsed.data.code.trim().toUpperCase()

  try {
    const user = await prisma.$transaction(async (tx) => {
      const row = await tx.redeemCode.findUnique({ where: { code: raw } })
      const now = new Date()
      if (
        !row ||
        row.validFrom > now ||
        row.validTo < now ||
        row.usedCount >= row.maxUses
      ) {
        throw new Error('REDEEM_INVALID')
      }

      await tx.redeemCode.update({
        where: { id: row.id },
        data: { usedCount: { increment: 1 } },
      })

      const u = await tx.user.findUniqueOrThrow({ where: { id: userId } })
      let membershipExpiresAt: Date
      if (row.grantLifetime) {
        membershipExpiresAt = MEMBERSHIP_FAR_END
      } else {
        membershipExpiresAt = extendMembershipExpires(
          u.membershipExpiresAt,
          row.grantedDays,
        )
      }

      return tx.user.update({
        where: { id: userId },
        data: { membershipExpiresAt },
      })
    })

    res.json(userJson(user))
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'REDEEM_INVALID') {
      res.status(400).json({ error: '兑换码无效或已用尽' })
      return
    }
    throw e
  }
})

app.get('/api/ledger', async (req, res) => {
  const token = authHeader(req)
  if (!token) {
    res.status(401).json({ error: '未登录' })
    return
  }
  const userId = userIdFromToken(token)
  if (!userId) {
    res.status(401).json({ error: '无效令牌' })
    return
  }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || !membershipActive(user.membershipExpiresAt)) {
    res.status(403).json({
      error: '需要有效会员才能使用云端备份，请在设置中兑换会员码',
      code: 'membership_required',
    })
    return
  }
  const ledger = await prisma.ledger.findUnique({ where: { userId } })
  if (!ledger) {
    res.status(404).json({ error: '账本不存在' })
    return
  }
  res.json({
    fields: ledger.fieldsJson,
    records: ledger.recordsJson,
    productCatalog: jsonArrayUnknown(ledger.productCatalogJson),
    productCatalogSuppressed: jsonStringArray(
      ledger.productCatalogSuppressedJson,
    ),
    voiceProductCorrections: jsonArrayUnknown(
      ledger.voiceProductCorrectionsJson,
    ),
    asrHotwordsSuppressed: jsonStringArray(
      ledger.asrHotwordsSuppressedJson,
    ),
    customerCatalog: jsonArrayUnknown(ledger.customerCatalogJson),
    customerCatalogSuppressed: jsonStringArray(
      ledger.customerCatalogSuppressedJson,
    ),
    updatedAt: ledger.updatedAt.toISOString(),
  })
})

app.put('/api/ledger', async (req, res) => {
  const token = authHeader(req)
  if (!token) {
    res.status(401).json({ error: '未登录' })
    return
  }
  const userId = userIdFromToken(token)
  if (!userId) {
    res.status(401).json({ error: '无效令牌' })
    return
  }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || !membershipActive(user.membershipExpiresAt)) {
    res.status(403).json({
      error: '需要有效会员才能使用云端备份，请在设置中兑换会员码',
      code: 'membership_required',
    })
    return
  }
  const parsed = LedgerPutSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: '请求体须包含 fields、records 数组' })
    return
  }
  const {
    fields,
    records,
    productCatalog,
    productCatalogSuppressed,
    customerCatalog,
    customerCatalogSuppressed,
    voiceProductCorrections,
    asrHotwordsSuppressed,
  } = parsed.data
  const data: {
    fieldsJson: object[]
    recordsJson: object[]
    productCatalogJson?: object[]
    productCatalogSuppressedJson?: string[]
    customerCatalogJson?: object[]
    customerCatalogSuppressedJson?: string[]
    voiceProductCorrectionsJson?: object[]
    asrHotwordsSuppressedJson?: string[]
  } = {
    fieldsJson: fields as object[],
    recordsJson: records as object[],
  }
  if (productCatalog !== undefined) {
    data.productCatalogJson = productCatalog as object[]
  }
  if (productCatalogSuppressed !== undefined) {
    data.productCatalogSuppressedJson = productCatalogSuppressed
  }
  if (customerCatalog !== undefined) {
    data.customerCatalogJson = customerCatalog as object[]
  }
  if (customerCatalogSuppressed !== undefined) {
    data.customerCatalogSuppressedJson = customerCatalogSuppressed
  }
  if (voiceProductCorrections !== undefined) {
    data.voiceProductCorrectionsJson = voiceProductCorrections as object[]
  }
  if (asrHotwordsSuppressed !== undefined) {
    data.asrHotwordsSuppressedJson = asrHotwordsSuppressed
  }
  const ledger = await prisma.ledger.update({
    where: { userId },
    data,
  })
  res.json({
    fields: ledger.fieldsJson,
    records: ledger.recordsJson,
    productCatalog: jsonArrayUnknown(ledger.productCatalogJson),
    productCatalogSuppressed: jsonStringArray(
      ledger.productCatalogSuppressedJson,
    ),
    voiceProductCorrections: jsonArrayUnknown(
      ledger.voiceProductCorrectionsJson,
    ),
    asrHotwordsSuppressed: jsonStringArray(
      ledger.asrHotwordsSuppressedJson,
    ),
    customerCatalog: jsonArrayUnknown(ledger.customerCatalogJson),
    customerCatalogSuppressed: jsonStringArray(
      ledger.customerCatalogSuppressedJson,
    ),
    updatedAt: ledger.updatedAt.toISOString(),
  })
})

async function ensureDefaultAdmin() {
  const seedEmail = 'admin'
  const existing = await prisma.user.findUnique({ where: { email: seedEmail } })
  if (existing) {
    if (!membershipActive(existing.membershipExpiresAt)) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { membershipExpiresAt: MEMBERSHIP_FAR_END },
      })
    }
    return
  }
  const passwordHash = await bcrypt.hash('123456', 10)
  await prisma.user.create({
    data: {
      email: seedEmail,
      passwordHash,
      membershipExpiresAt: MEMBERSHIP_FAR_END,
      ledger: {
        create: {
          fieldsJson: [],
          recordsJson: [],
        },
      },
    },
  })
  console.log('[ledger-api] seeded default user: admin / 123456')
}

async function bootstrap() {
  if (!aliyunSmsConfigured()) {
    console.warn(
      '[ledger-api] 未配置阿里云短信密钥：手机号验证码登录不可用，直至设置 ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET',
    )
  }
  if (!doubaoEnvReady()) {
    console.warn(
      '[ledger-api] 未配置 DOUBAO_API_KEY：语音智能解析不可用，直至在服务端环境变量中设置',
    )
  } else if (!voiceParseModelReady()) {
    console.warn(
      '[ledger-api] 已配置 DOUBAO_API_KEY 但未配置 DOUBAO_MODEL：请在火山方舟创建推理接入点，将 ep- 开头的 ID 写入 DOUBAO_MODEL',
    )
  } else {
    console.log(
      `[ledger-api] 豆包语音解析已启用，模型=${getVoiceParseModelId()}`,
    )
  }
  if (doubaoEnvReady() && billParseModelReady()) {
    console.log(
      `[ledger-api] 图片账单识别已启用，模型=${getBillParseModelId()}`,
    )
  } else if (doubaoEnvReady()) {
    console.warn(
      '[ledger-api] 已配置 DOUBAO_API_KEY 但未配置 DOUBAO_VISION_MODEL：图片识别不可用',
    )
  }
  if (xfyunAsrEnvReady()) {
    console.log(
      `[ledger-api] 讯飞方言识别大模型已启用 url=${
        process.env.XFYUN_ASR_WS_URL?.trim() || 'wss://iat.cn-huabei-1.xf-yun.com/v1'
      }`,
    )
  }
  if (alipayEnvReady()) {
    console.log(
      `[ledger-api] 支付宝会员支付已启用 sandbox=${alipaySandboxMode()} appId=${alipayAppId()}`,
    )
    for (const w of alipayConfigWarnings()) {
      console.warn(`[ledger-api] 支付宝配置警告: ${w}`)
    }
  } else {
    console.warn(
      '[ledger-api] 未配置 ALIPAY_APP_ID / ALIPAY_PRIVATE_KEY / ALIPAY_PUBLIC_KEY：会员支付不可用',
    )
  }
  await ensureDefaultAdmin()
  const httpServer = http.createServer(app)
  attachAsrWebSocket(httpServer, {
    verifyToken: (t) => userIdFromToken(t),
  })
  httpServer.listen(PORT, () => {
    console.log(`ledger-api listening on :${PORT}`)
  })
}

bootstrap().catch((err) => {
  console.error(err)
  process.exit(1)
})
