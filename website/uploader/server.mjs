import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import multer from 'multer'

const PORT = Number(process.env.PORT) || 3005
const UPLOAD_TOKEN = (process.env.UPLOAD_TOKEN || '').trim()
const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR || '/data/downloads'
const RELEASES_PATH =
  process.env.RELEASES_PATH || path.join('/data/public', 'releases.json')

const app = express()
app.use(express.json({ limit: '1mb' }))

function safeBasename(name) {
  const base = path.basename(name || '').replace(/[^\w.\-()+ ]/g, '_')
  if (!base || base === '.' || base === '..') return null
  if (!/\.apk$/i.test(base)) return null
  return base
}

/** 删除列表项时按「basename + 忽略大小写」匹配，避免与 JSON 里文件名略有出入时误报 404 */
function apkBasenameForMatch(ref) {
  const s = String(ref ?? '').trim()
  if (!s || s.includes('..')) return ''
  const b = path.basename(s)
  if (!/\.apk$/i.test(b)) return ''
  return b
}

function tokenOk(req) {
  if (!UPLOAD_TOKEN) return false
  const h = req.headers.authorization || ''
  const bearer = h.startsWith('Bearer ') ? h.slice(7).trim() : ''
  const bodyToken =
    typeof req.body?.token === 'string' ? req.body.token.trim() : ''
  return bearer === UPLOAD_TOKEN || bodyToken === UPLOAD_TOKEN
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DOWNLOADS_DIR),
  filename: (_req, file, cb) => {
    const s = safeBasename(file.originalname)
    cb(null, s || `kuaiji-${Date.now()}.apk`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uploadEnabled: Boolean(UPLOAD_TOKEN) })
})

/** 管理页登录校验（仅 JSON body.token） */
app.post('/api/auth/login', (req, res) => {
  if (!UPLOAD_TOKEN) {
    res.status(503).json({ error: '服务端未配置 UPLOAD_TOKEN' })
    return
  }
  const t = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
  if (t === UPLOAD_TOKEN) {
    res.json({ ok: true })
    return
  }
  res.status(401).json({ error: '令牌错误' })
})

app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      res.status(400).json({ error: err.message || '上传失败' })
      return
    }
    if (!UPLOAD_TOKEN) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {})
      res.status(503).json({ error: '未配置 UPLOAD_TOKEN，上传已禁用' })
      return
    }
    if (!tokenOk(req)) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {})
      res.status(401).json({ error: '无效或缺少上传令牌' })
      return
    }
    if (!req.file) {
      res.status(400).json({ error: '请选择 APK 文件' })
      return
    }
    const version = String(req.body.version || '').trim()
    if (!version) {
      await fs.unlink(req.file.path).catch(() => {})
      res.status(400).json({ error: '请填写版本号' })
      return
    }
    const date =
      String(req.body.date || '').trim() ||
      new Date().toISOString().slice(0, 10)
    const notes = String(req.body.notes || '').trim()
    const channel = String(req.body.channel || '').trim() || 'release'

    try {
      let raw
      try {
        raw = await fs.readFile(RELEASES_PATH, 'utf8')
      } catch {
        raw = '{"appName":"记账本","items":[]}'
      }
      let data
      try {
        data = JSON.parse(raw)
      } catch {
        data = { appName: '记账本', items: [] }
      }
      if (!Array.isArray(data.items)) data.items = []

      const file = path.basename(req.file.path)
      const entry = { version, file, date, channel, notes }
      data.items = [entry, ...data.items.filter((x) => x?.file !== file)]

      const tmp = `${RELEASES_PATH}.${process.pid}.tmp`
      await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
      await fs.rename(tmp, RELEASES_PATH)

      res.json({ ok: true, entry })
    } catch (e) {
      console.error(e)
      await fs.unlink(req.file.path).catch(() => {})
      res.status(500).json({
        error: e instanceof Error ? e.message : '服务器错误',
      })
    }
  })
})

app.post('/api/release/delete', async (req, res) => {
  if (!UPLOAD_TOKEN) {
    res.status(503).json({ error: '未配置 UPLOAD_TOKEN' })
    return
  }
  if (!tokenOk(req)) {
    res.status(401).json({ error: '无效或缺少上传令牌' })
    return
  }
  const target = apkBasenameForMatch(req.body?.file)
  if (!target) {
    res.status(400).json({ error: '无效的 APK 文件名' })
    return
  }
  const targetLower = target.toLowerCase()
  try {
    let raw
    try {
      raw = await fs.readFile(RELEASES_PATH, 'utf8')
    } catch {
      raw = '{"appName":"记账本","items":[]}'
    }
    let data
    try {
      data = JSON.parse(raw)
    } catch {
      data = { appName: '记账本', items: [] }
    }
    if (!Array.isArray(data.items)) data.items = []

    const removedNames = []
    data.items = data.items.filter((x) => {
      const bn = apkBasenameForMatch(x?.file)
      if (bn && bn.toLowerCase() === targetLower) {
        removedNames.push(bn)
        return false
      }
      return true
    })

    if (removedNames.length === 0) {
      res.status(404).json({
        error: `列表中找不到「${target}」。请刷新页面后重试；若服务端未重建镜像，请在 website 目录执行 docker compose up -d --build。`,
      })
      return
    }

    const tmp = `${RELEASES_PATH}.${process.pid}.tmp`
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
    await fs.rename(tmp, RELEASES_PATH)

    for (const n of removedNames) {
      await fs.unlink(path.join(DOWNLOADS_DIR, n)).catch(() => {})
    }

    res.json({ ok: true, removed: removedNames })
  } catch (e) {
    console.error(e)
    res.status(500).json({
      error: e instanceof Error ? e.message : '服务器错误',
    })
  }
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`uploader listening on :${PORT}`)
})
