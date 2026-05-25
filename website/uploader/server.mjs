import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import multer from 'multer'

const PORT = Number(process.env.PORT) || 3005
const UPLOAD_TOKEN = (process.env.UPLOAD_TOKEN || '').trim()
const LEDGER_API_URL = (process.env.LEDGER_API_URL || '').trim().replace(/\/$/, '')
const LEDGER_ADMIN_TOKEN = (process.env.LEDGER_ADMIN_TOKEN || '').trim()
const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR || '/data/downloads'
const RELEASES_PATH =
  process.env.RELEASES_PATH || path.join('/data/public', 'releases.json')

const app = express()
app.use(express.json({ limit: '1mb' }))

/** 上传文件名：仅允许 .apk / .zip，返回类型与净化后的 basename */
function safeReleaseBasename(originalName) {
  const base = path.basename(originalName || '').replace(/[^\w.\-()+ ]/g, '_')
  if (!base || base === '.' || base === '..') return null
  const lower = base.toLowerCase()
  if (lower.endsWith('.apk')) return { kind: 'apk', name: base }
  if (lower.endsWith('.zip')) return { kind: 'zip', name: base }
  return null
}

/** 删除接口：解析要删的 basename（apk 或 zip） */
function releaseAssetBasenameForDelete(ref) {
  const s = String(ref ?? '').trim()
  if (!s || s.includes('..')) return null
  const b = path.basename(s)
  const lower = b.toLowerCase()
  if (lower.endsWith('.apk')) return { kind: 'apk', name: b }
  if (lower.endsWith('.zip')) return { kind: 'zip', name: b }
  return null
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
    const s = safeReleaseBasename(file.originalname)
    cb(null, s?.name || `kuaiji-${Date.now()}.apk`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (safeReleaseBasename(file.originalname)) {
      cb(null, true)
      return
    }
    cb(new Error('只支持 .apk 安装包或 .zip 热更新包'))
  },
})

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    uploadEnabled: Boolean(UPLOAD_TOKEN),
    statsEnabled: Boolean(LEDGER_API_URL && LEDGER_ADMIN_TOKEN),
    ledgerApiConfigured: Boolean(LEDGER_API_URL),
    ledgerTokenConfigured: Boolean(LEDGER_ADMIN_TOKEN),
  })
})

app.get('/api/admin/overview', async (req, res) => {
  if (!UPLOAD_TOKEN) {
    res.status(503).json({ error: '未配置 UPLOAD_TOKEN' })
    return
  }
  if (!tokenOk(req)) {
    res.status(401).json({ error: '无效或缺少上传令牌' })
    return
  }
  if (!LEDGER_API_URL || !LEDGER_ADMIN_TOKEN) {
    res.status(503).json({
      error: '未配置 LEDGER_API_URL 或 LEDGER_ADMIN_TOKEN，无法拉取业务数据',
    })
    return
  }
  try {
    const r = await fetch(`${LEDGER_API_URL}/api/site-admin/overview`, {
      headers: { Authorization: `Bearer ${LEDGER_ADMIN_TOKEN}` },
    })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) {
      res.status(r.status).json(body)
      return
    }
    res.json(body)
  } catch (e) {
    console.error('[admin/overview]', e)
    res.status(502).json({
      error: e instanceof Error ? e.message : '无法连接业务 API',
    })
  }
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
      res.status(400).json({ error: '请选择 APK 或 zip 热更新包' })
      return
    }
    const kind = safeReleaseBasename(req.file.originalname)?.kind
    if (!kind) {
      await fs.unlink(req.file.path).catch(() => {})
      res.status(400).json({ error: '不支持的文件类型' })
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

    const parseOptInt = (v) => {
      const n = parseInt(String(v ?? '').trim(), 10)
      return Number.isFinite(n) && n > 0 ? n : undefined
    }
    const versionCode = parseOptInt(req.body.versionCode)
    const minNativeVersionCode = parseOptInt(req.body.minNativeVersionCode)
    const bundleVersionRaw = String(req.body.bundleVersion || '').trim()
    const bundleVersion = bundleVersionRaw || version

    try {
      let raw
      try {
        raw = await fs.readFile(RELEASES_PATH, 'utf8')
      } catch {
        raw = '{"appName":"kuaiji","items":[]}'
      }
      let data
      try {
        data = JSON.parse(raw)
      } catch {
        data = { appName: 'kuaiji', items: [] }
      }
      if (!Array.isArray(data.items)) data.items = []

      const uploadedName = path.basename(req.file.path)
      /** @type {Record<string, unknown>} */
      let entry
      if (kind === 'apk') {
        entry = { version, file: uploadedName, date, channel, notes }
        if (versionCode != null) entry.versionCode = versionCode
      } else {
        entry = {
          version,
          bundle: uploadedName,
          bundleVersion,
          date,
          channel,
          notes,
        }
        if (minNativeVersionCode != null) {
          entry.minNativeVersionCode = minNativeVersionCode
        }
      }

      data.items = [
        entry,
        ...data.items.filter((x) => {
          if (kind === 'apk' && x?.file === uploadedName) return false
          if (kind === 'zip' && x?.bundle === uploadedName) return false
          return true
        }),
      ]

      const tmp = `${RELEASES_PATH}.${process.pid}.tmp`
      await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
      await fs.rename(tmp, RELEASES_PATH)

      res.json({ ok: true, entry, kind })
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
  const rawTarget =
    req.body?.target ?? req.body?.file ?? req.body?.bundle ?? ''
  const parsed = releaseAssetBasenameForDelete(rawTarget)
  if (!parsed) {
    res.status(400).json({ error: '无效的 APK 或 zip 文件名' })
    return
  }
  const targetLower = parsed.name.toLowerCase()
  try {
    let raw
    try {
      raw = await fs.readFile(RELEASES_PATH, 'utf8')
    } catch {
      raw = '{"appName":"kuaiji","items":[]}'
    }
    let data
    try {
      data = JSON.parse(raw)
    } catch {
      data = { appName: 'kuaiji', items: [] }
    }
    if (!Array.isArray(data.items)) data.items = []

    const removedRows = []
    data.items = data.items.filter((x) => {
      const f = String(x?.file ?? '').trim()
      const b = String(x?.bundle ?? '').trim()
      const fbn = f ? path.basename(f).toLowerCase() : ''
      const bbn = b ? path.basename(b).toLowerCase() : ''
      if (fbn === targetLower || bbn === targetLower) {
        removedRows.push(x)
        return false
      }
      return true
    })

    if (removedRows.length === 0) {
      res.status(404).json({
        error: `列表中找不到「${parsed.name}」。请刷新页面后重试；若服务端未重建镜像，请在 website 目录执行 docker compose up -d --build。`,
      })
      return
    }

    const tmp = `${RELEASES_PATH}.${process.pid}.tmp`
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
    await fs.rename(tmp, RELEASES_PATH)

    const toUnlink = new Set()
    for (const row of removedRows) {
      const f = String(row?.file ?? '').trim()
      const b = String(row?.bundle ?? '').trim()
      if (f) toUnlink.add(path.basename(f))
      if (b) toUnlink.add(path.basename(b))
    }
    for (const n of toUnlink) {
      await fs.unlink(path.join(DOWNLOADS_DIR, n)).catch(() => {})
    }

    res.json({ ok: true, removed: [...toUnlink] })
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
