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
  const file = safeBasename(req.body?.file)
  if (!file) {
    res.status(400).json({ error: '无效的 APK 文件名' })
    return
  }
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
    const before = data.items.length
    data.items = data.items.filter((x) => x?.file !== file)
    if (data.items.length === before) {
      res.status(404).json({ error: '列表中无此文件' })
      return
    }

    const tmp = `${RELEASES_PATH}.${process.pid}.tmp`
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
    await fs.rename(tmp, RELEASES_PATH)

    const apkPath = path.join(DOWNLOADS_DIR, file)
    await fs.unlink(apkPath).catch(() => {})

    res.json({ ok: true, removed: file })
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
