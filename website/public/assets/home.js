const PENDING_INVITE_KEY = 'kuaiji_pending_invite_code'

/** 方案 B：下载页 /download?invite= 写入 localStorage，供 APK 首次启动读取 */
function captureInviteFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search)
    const raw =
      params.get('invite') || params.get('ref') || params.get('code')
    if (!raw) return
    const code = String(raw)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
    if (code.length >= 4) {
      localStorage.setItem(PENDING_INVITE_KEY, code)
    }
  } catch {
    /* ignore */
  }
}

captureInviteFromUrl()

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 列表中第一条带 file 的 APK 视为最新整包 */
function latestApkRelease(items) {
  if (!Array.isArray(items)) return null
  for (const row of items) {
    const file = String(row?.file ?? '').trim()
    if (file) return row
  }
  return null
}

async function bindLatestDownload() {
  const link = document.getElementById('dl-apk')
  const heroDl = document.getElementById('hero-dl')
  const sub = document.getElementById('dl-sub')
  const main = document.getElementById('dl-main')
  const notes = document.getElementById('dl-notes')
  const status = document.getElementById('dl-status')

  try {
    const res = await fetch('/releases.json', { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const latest = latestApkRelease(data.items)

    if (!latest) {
      sub.textContent = '暂无安装包'
      main.textContent = '请稍后再试'
      status.textContent = '管理员尚未发布 APK，请联系客服或稍后再访问。'
      return
    }

    const ver = String(latest.version ?? '').trim()
    const file = String(latest.file ?? '').trim()
    const date = String(latest.date ?? '').trim()
    const noteText = String(latest.notes ?? '').trim()
    const href = `/downloads/${encodeURIComponent(file)}`

    link.href = href
    link.classList.remove('disabled')
    link.setAttribute('download', file)
    if (heroDl) heroDl.href = href

    sub.textContent = date ? `更新于 ${date}` : '最新版本'
    main.textContent = ver ? `下载 Android ${ver}` : '下载 Android 版'
    notes.textContent = noteText
      ? `版本 ${escapeHtml(ver)} · ${escapeHtml(noteText)}`
      : ver
        ? `当前最新版本：${ver}`
        : ''
    status.textContent = ''
  } catch (e) {
    sub.textContent = '加载失败'
    main.textContent = '无法获取下载'
    status.textContent =
      e instanceof Error ? e.message : '请刷新页面或联系管理员'
  }
}

const fadeObs = new IntersectionObserver(
  (entries) => {
    entries.forEach((en, i) => {
      if (en.isIntersecting) {
        setTimeout(() => en.target.classList.add('visible'), i * 80)
        fadeObs.unobserve(en.target)
      }
    })
  },
  { threshold: 0.08 },
)
document.querySelectorAll('.fade-up').forEach((el) => fadeObs.observe(el))

bindLatestDownload()
