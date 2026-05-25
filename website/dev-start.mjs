import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = val
  }
}

loadEnv(path.join(ROOT, '.env'))
fs.mkdirSync(path.join(ROOT, 'downloads'), { recursive: true })

const uploaderDir = path.join(ROOT, 'uploader')
const uploaderEnv = {
  ...process.env,
  PORT: '3005',
  DOWNLOADS_DIR: path.join(ROOT, 'downloads'),
  RELEASES_PATH: path.join(ROOT, 'public', 'releases.json'),
}

console.log('[website] 启动 uploader (API :3005)…')
const uploader = spawn('node', ['server.mjs'], {
  cwd: uploaderDir,
  env: uploaderEnv,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

function waitForApi(retries = 30) {
  return new Promise((resolve, reject) => {
    let left = retries
    const tick = () => {
      const req = http.get('http://127.0.0.1:3005/api/health', (res) => {
        res.resume()
        if (res.statusCode === 200) resolve()
        else if (--left <= 0) reject(new Error('API health 超时'))
        else setTimeout(tick, 300)
      })
      req.on('error', () => {
        if (--left <= 0) reject(new Error('API 未响应'))
        else setTimeout(tick, 300)
      })
    }
    tick()
  })
}

uploader.on('error', (err) => {
  console.error('[website] 无法启动 uploader:', err.message)
  process.exit(1)
})

waitForApi()
  .then(() => {
    console.log('[website] API 就绪，启动静态站…')
    import('./dev-server.mjs')
  })
  .catch((err) => {
    console.error('[website]', err.message)
    uploader.kill()
    process.exit(1)
  })

function shutdown() {
  uploader.kill()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
