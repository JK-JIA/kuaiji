import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.join(ROOT, 'public')
const DOWNLOADS = path.join(ROOT, 'downloads')
const PORT = Number(process.env.WEB_PORT) || 8080
const API_TARGET = (process.env.API_PROXY_TARGET || 'http://127.0.0.1:3005').replace(
  /\/$/,
  '',
);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.apk': 'application/vnd.android.package-archive',
  '.zip': 'application/zip',
}

function safePath(base, rel) {
  const decoded = decodeURIComponent(rel.split('?')[0])
  const resolved = path.resolve(base, decoded)
  if (!resolved.startsWith(path.resolve(base))) return null
  return resolved
}

function proxyApi(req, res) {
  const target = new URL(req.url, API_TARGET)
  const headers = { ...req.headers, host: target.host }
  const proxyReq = http.request(
    {
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: target.pathname + target.search,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
      proxyRes.pipe(res)
    },
  )
  proxyReq.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'API 未启动，请确认 uploader 在 3005 端口运行' }))
  })
  req.pipe(proxyReq)
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const type = MIME[ext] || 'application/octet-stream'
  const stream = fs.createReadStream(filePath)
  stream.on('error', () => {
    res.writeHead(404)
    res.end('Not Found')
  })
  res.writeHead(200, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' })
  if (ext === '.apk' || ext === '.zip') {
    res.setHeader('Content-Disposition', 'attachment')
  }
  stream.pipe(res)
}

function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0]
  if (urlPath === '/') urlPath = '/index.html'

  if (urlPath.startsWith('/downloads/')) {
    const rel = urlPath.slice('/downloads/'.length)
    const file = safePath(DOWNLOADS, rel)
    if (!file || !fs.existsSync(file)) {
      res.writeHead(404)
      res.end('Not Found')
      return
    }
    sendFile(res, file)
    return
  }

  const file = safePath(PUBLIC, urlPath.replace(/^\//, ''))
  if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
    sendFile(res, file)
    return
  }

  const fallback = path.join(PUBLIC, 'index.html')
  if (fs.existsSync(fallback)) {
    sendFile(res, fallback)
    return
  }

  res.writeHead(404)
  res.end('Not Found')
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    proxyApi(req, res)
    return
  }
  serveStatic(req, res)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[website] 静态站 http://127.0.0.1:${PORT}/`)
  console.log(`[website] 管理后台 http://127.0.0.1:${PORT}/admin.html`)
})
