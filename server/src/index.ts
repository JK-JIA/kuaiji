import { randomBytes } from 'crypto'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import cors from 'cors'
import express from 'express'
import http from 'http'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import {
  aliyunSmsConfigured,
  sendAliyunSmsVerifyCode,
  verifyAliyunSmsCode,
} from './aliyunSms.js'
import { attachAsrWebSocket, volcAsrEnvReady } from './asrStream.js'
import { doubaoEnvReady, parseVoiceOnServer } from './voiceParse.js'

const prisma = new PrismaClient()

/** 与 ensureDefaultAdmin、永久兑换码一致 */
const MEMBERSHIP_FAR_END = new Date('2099-12-31T15:59:59.000Z')

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
  voiceProductCorrections: z.array(z.unknown()).optional(),
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
})

const RedeemSchema = z.object({
  code: z.string().min(4).max(64),
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

const lastSmsSend = new Map<string, number>()

function authHeader(req: express.Request): string | null {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) return null
  return h.slice(7).trim() || null
}

function userIdFromToken(token: string): string | null {
  try {
    const p = jwt.verify(token, JWT_SECRET) as { sub?: string }
    return typeof p.sub === 'string' ? p.sub : null
  } catch {
    return null
  }
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
}) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    membershipExpiresAt: user.membershipExpiresAt?.toISOString() ?? null,
  }
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
  res.json({ ok: true })
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
    doubaoEnvReady: doubaoEnvReady(),
    websocketPath: '/api/asr/stream',
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
      error: '服务端未配置豆包解析（DOUBAO_API_KEY）',
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
      ledger: {
        create: {
          fieldsJson: [],
          recordsJson: [],
        },
      },
    },
  })
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '30d' })
  res.status(201).json({
    token,
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
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '30d' })
  res.json({
    token,
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

  const email = smsEmailForPhone(phone)
  let user = await prisma.user.findFirst({
    where: { OR: [{ phone }, { email }] },
  })

  if (!user) {
    const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 10)
    user = await prisma.user.create({
      data: {
        email,
        phone,
        phoneVerifiedAt: new Date(),
        passwordHash,
        membershipExpiresAt: null,
        ledger: {
          create: {
            fieldsJson: [],
            recordsJson: [],
          },
        },
      },
    })
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { phone, phoneVerifiedAt: new Date() },
    })
  }

  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '30d' })
  res.json({
    token,
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
        const base =
          membershipActive(u.membershipExpiresAt) && u.membershipExpiresAt
            ? u.membershipExpiresAt
            : now
        const addMs = row.grantedDays * 24 * 60 * 60 * 1000
        membershipExpiresAt = new Date(base.getTime() + addMs)
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
    voiceProductCorrections,
  } = parsed.data
  const data: {
    fieldsJson: object[]
    recordsJson: object[]
    productCatalogJson?: object[]
    productCatalogSuppressedJson?: string[]
    voiceProductCorrectionsJson?: object[]
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
  if (voiceProductCorrections !== undefined) {
    data.voiceProductCorrectionsJson = voiceProductCorrections as object[]
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
  } else {
    console.log(
      `[ledger-api] 豆包语音解析已启用，模型=${process.env.DOUBAO_MODEL?.trim() || 'doubao-seed-1-8-251228'}`,
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
