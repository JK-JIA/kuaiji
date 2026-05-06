import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import cors from 'cors'
import express from 'express'
import http from 'http'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { attachAsrWebSocket, volcAsrEnvReady } from './asrStream.js'

const prisma = new PrismaClient()

const PORT = Number(process.env.PORT) || 3001
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-change-JWT_SECRET-in-production-min-32-chars'
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? '*'

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(128),
})

/** 登录：账号存于 `email` 字段，可为默认 `admin` 或任意注册邮箱 */
const LoginSchema = z.object({
  email: z.string().min(1).max(191),
  password: z.string().min(6).max(128),
})

const LedgerPutSchema = z.object({
  fields: z.array(z.unknown()),
  records: z.array(z.unknown()),
})

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

/** 语音诊断：不含密钥，供 App 预检与复制日志排查 */
app.get('/api/asr/health', (_req, res) => {
  res.json({
    ok: true,
    volcAsrEnvReady: volcAsrEnvReady(),
    websocketPath: '/api/asr/stream',
    handshakeNotes:
      'After WS connect, send first text JSON: type auth + JWT token field',
    node: process.version,
  })
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
    user: { id: user.id, email: user.email },
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
    user: { id: user.id, email: user.email },
  })
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
  const ledger = await prisma.ledger.findUnique({ where: { userId } })
  if (!ledger) {
    res.status(404).json({ error: '账本不存在' })
    return
  }
  res.json({
    fields: ledger.fieldsJson,
    records: ledger.recordsJson,
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
  const parsed = LedgerPutSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: '请求体须包含 fields、records 数组' })
    return
  }
  const { fields, records } = parsed.data
  const ledger = await prisma.ledger.update({
    where: { userId },
    data: {
      fieldsJson: fields as object[],
      recordsJson: records as object[],
    },
  })
  res.json({
    fields: ledger.fieldsJson,
    records: ledger.recordsJson,
    updatedAt: ledger.updatedAt.toISOString(),
  })
})

async function ensureDefaultAdmin() {
  const seedEmail = 'admin'
  const existing = await prisma.user.findUnique({ where: { email: seedEmail } })
  if (existing) return
  const passwordHash = await bcrypt.hash('123456', 10)
  await prisma.user.create({
    data: {
      email: seedEmail,
      passwordHash,
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
