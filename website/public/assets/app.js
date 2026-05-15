const TOKEN_KEY = 'ledger_dl_admin_token'

/** @type {boolean} */
let uploadEnabled = false

function getStoredToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

function setStoredToken(t) {
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

function authHeader() {
  const t = getStoredToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

function isAdminLoggedIn() {
  return Boolean(getStoredToken())
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** @param {Record<string, unknown>} row */
function rowKind(row) {
  const hasB = Boolean(row?.bundle && String(row.bundle).trim())
  const hasF = Boolean(row?.file && String(row.file).trim())
  if (hasB && hasF) return 'both'
  if (hasB) return 'hot'
  return 'apk'
}

/** @param {Record<string, unknown>} row */
function deleteTargetForRow(row) {
  return String(row.file || row.bundle || '').trim()
}

/** @param {Record<string, unknown>} row */
function kindBadgeHtml(row) {
  const k = rowKind(row)
  if (k === 'both') {
    return '<span class="item-kind item-kind--both">整包+热更</span>'
  }
  if (k === 'hot') {
    return '<span class="item-kind item-kind--hot">热更新 zip</span>'
  }
  return '<span class="item-kind item-kind--apk">整包 APK</span>'
}

async function loadReleases() {
  const loading = document.getElementById('loading')
  const errEl = document.getElementById('error')
  const list = document.getElementById('list')

  loading.classList.remove('hidden')
  errEl.classList.add('hidden')
  errEl.textContent = ''
  list.classList.add('hidden')

  try {
    const res = await fetch('/releases.json', { cache: 'no-store' })
    if (!res.ok) throw new Error(`无法读取 releases.json（HTTP ${res.status}）`)
    const data = await res.json()
    const items = Array.isArray(data.items) ? data.items : []

    loading.classList.add('hidden')

    if (items.length === 0) {
      errEl.innerHTML =
        '暂无版本。' +
        (uploadEnabled
          ? '登录管理后台后可上传；或在服务器上维护 <code>downloads/</code> 与 <code>releases.json</code>。'
          : '请在服务器上向 <code>downloads/</code> 放 APK 并编辑 <code>releases.json</code>。') +
        '<br /><span class="hint-muted">仅删除磁盘上的文件不会更新列表，需改 JSON 或使用管理后台「删除」。</span>'
      errEl.classList.remove('hidden')
      return
    }

    const showDel = isAdminLoggedIn()

    list.innerHTML = items
      .map((row) => {
        const ver = escapeHtml(row.version ?? '')
        const date = escapeHtml(row.date ?? '')
        const channel = row.channel ? escapeHtml(String(row.channel)) : ''
        const notes = row.notes ? escapeHtml(String(row.notes)) : ''
        const file = String(row.file ?? '').trim()
        const bundle = String(row.bundle ?? '').trim()
        const fileEsc = file ? escapeHtml(file) : ''
        const bundleEsc = bundle ? escapeHtml(bundle) : ''
        const meta = [date, channel].filter(Boolean).join(' · ')
        const delTarget = deleteTargetForRow(row)
        const deleteBtn = showDel && delTarget
          ? `<button type="button" class="btn-del" data-target="${encodeURIComponent(delTarget)}">删除</button>`
          : ''
        const fileLines = [
          file
            ? `<p class="file-line"><span class="file-tag">APK</span> <code>${fileEsc}</code></p>`
            : '',
          bundle
            ? `<p class="file-line"><span class="file-tag">zip</span> <code>${bundleEsc}</code></p>`
            : '',
        ]
          .filter(Boolean)
          .join('')
        const dlBtns = [
          file
            ? `<a class="btn" href="/downloads/${encodeURIComponent(file)}" download>下载 APK</a>`
            : '',
          bundle
            ? `<a class="btn btn-secondary" href="/downloads/${encodeURIComponent(bundle)}" download>下载热更包</a>`
            : '',
        ]
          .filter(Boolean)
          .join('')
        return `<li class="item">
          <div class="item-top">
            <span class="ver">v${ver}</span>${kindBadgeHtml(row)}
            ${meta ? `<span class="meta">${meta}</span>` : ''}
          </div>
          ${fileLines || '<p class="file-line hint-muted">（无文件字段，请检查 JSON）</p>'}
          ${notes ? `<p class="notes">${notes}</p>` : ''}
          <div class="item-actions">
            ${dlBtns || '<span class="hint-muted">无下载链接</span>'}
            ${deleteBtn}
          </div>
        </li>`
      })
      .join('')

    list.querySelectorAll('.btn-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const raw = btn.getAttribute('data-target')
        const f = raw ? decodeURIComponent(raw) : ''
        if (f) void deleteRelease(f)
      })
    })

    list.classList.remove('hidden')
  } catch (e) {
    loading.classList.add('hidden')
    errEl.textContent = e instanceof Error ? e.message : '加载失败'
    errEl.classList.remove('hidden')
  }
}

async function deleteRelease(target) {
  if (!isAdminLoggedIn()) {
    window.alert('请先登录管理后台。')
    return
  }
  if (
    !window.confirm(
      `确定删除「${target}」？\n将从列表移除，并删除服务器上对应 APK / zip（若仍存在）。`,
    )
  ) {
    return
  }
  try {
    const res = await fetch('/api/release/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(),
      },
      body: JSON.stringify({ target }),
    })
    const text = await res.text()
    let j = {}
    try {
      j = text ? JSON.parse(text) : {}
    } catch {
      j = {}
    }
    if (res.status === 401) {
      setStoredToken('')
      showLoginView()
      await loadReleases()
      window.alert('登录已失效，请重新登录。')
      return
    }
    if (!res.ok) {
      const hint404 =
        res.status === 404 && !j.error
          ? '接口不存在或服务未更新：请在服务器进入 website 目录执行 docker compose up -d --build 后重试。'
          : ''
      window.alert(j.error || hint404 || `删除失败（HTTP ${res.status}）`)
      return
    }
    await loadReleases()
  } catch (e) {
    window.alert(e instanceof Error ? e.message : '网络错误')
  }
}

function showLoginView() {
  document.getElementById('admin-login-card')?.classList.remove('hidden')
  document.getElementById('admin-panel')?.classList.add('hidden')
}

function showPanelView() {
  document.getElementById('admin-login-card')?.classList.add('hidden')
  document.getElementById('admin-panel')?.classList.remove('hidden')
}

function loginApiMissingHint(status) {
  if (status !== 404) return ''
  return ' 常见原因：未部署最新 nginx 配置（缺少 /api/ 反代）或 uploader 镜像过旧。请在服务器进入 website 目录执行 git pull 与 docker compose up -d --build。'
}

async function tryRestoreSession() {
  const t = getStoredToken()
  if (!t) {
    showLoginView()
    return
  }
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: t }),
    })
    if (res.ok) {
      showPanelView()
      return
    }
  } catch {
    /* network */
  }
  setStoredToken('')
  showLoginView()
}

async function setupAdmin() {
  const section = document.getElementById('admin-section')
  const adminOff = document.getElementById('admin-off')
  const loginForm = document.getElementById('login-form')
  const loginMsg = document.getElementById('login-msg')
  const uploadForm = document.getElementById('upload-form')
  const uploadMsg = document.getElementById('upload-msg')
  const dateInput = document.getElementById('upload-date')
  const btnLogout = document.getElementById('btn-logout')

  try {
    const h = await fetch('/api/health', { cache: 'no-store' })
    const j = h.ok ? await h.json() : {}
    uploadEnabled = Boolean(j.uploadEnabled)
  } catch {
    uploadEnabled = false
  }

  if (!uploadEnabled) {
    section.classList.remove('hidden')
    adminOff.classList.remove('hidden')
    document.getElementById('admin-login-card')?.classList.add('hidden')
    document.getElementById('admin-panel')?.classList.add('hidden')
    return
  }

  section.classList.remove('hidden')
  adminOff.classList.add('hidden')
  document.getElementById('admin-login-card')?.classList.remove('hidden')

  dateInput.value = new Date().toISOString().slice(0, 10)

  await tryRestoreSession()

  loginForm.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    loginMsg.textContent = ''
    loginMsg.classList.remove('ok', 'err')
    const input = document.getElementById('login-token')
    const token = input.value.trim()
    const btn = loginForm.querySelector('.btn-submit')
    btn.disabled = true
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const text = await res.text()
      let j = {}
      try {
        j = text ? JSON.parse(text) : {}
      } catch {
        j = {}
      }
      if (!res.ok) {
        loginMsg.textContent =
          (j.error || `登录失败（HTTP ${res.status}）`) + loginApiMissingHint(res.status)
        loginMsg.classList.add('err')
        return
      }
      setStoredToken(token)
      loginMsg.textContent = '登录成功。'
      loginMsg.classList.add('ok')
      input.value = ''
      showPanelView()
      await loadReleases()
    } catch (e) {
      loginMsg.textContent = e instanceof Error ? e.message : '网络错误'
      loginMsg.classList.add('err')
    } finally {
      btn.disabled = false
    }
  })

  btnLogout.addEventListener('click', () => {
    setStoredToken('')
    showLoginView()
    loginMsg.textContent = ''
    loginMsg.classList.remove('ok', 'err')
    void loadReleases()
  })

  uploadForm.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    uploadMsg.textContent = ''
    uploadMsg.classList.remove('ok', 'err')
    const btn = uploadForm.querySelector('.btn-submit')
    btn.disabled = true
    try {
      const fd = new FormData(uploadForm)
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: authHeader(),
        body: fd,
      })
      const j = await res.json().catch(() => ({}))
      if (res.status === 401) {
        setStoredToken('')
        showLoginView()
        await loadReleases()
        uploadMsg.textContent = '登录已失效，请重新登录。'
        uploadMsg.classList.add('err')
        return
      }
      if (!res.ok) {
        uploadMsg.textContent = j.error || `上传失败（HTTP ${res.status}）`
        uploadMsg.classList.add('err')
        return
      }
      uploadMsg.textContent =
        j.kind === 'zip'
          ? '热更新 zip 已发布并写入列表，可继续上传下一版。'
          : j.kind === 'apk'
            ? '整包 APK 已发布并写入列表，可继续上传下一版。'
            : '已发布，可继续上传下一版。'
      uploadMsg.classList.add('ok')
      const v = uploadForm.querySelector('[name="version"]')
      const f = uploadForm.querySelector('[name="file"]')
      const n = uploadForm.querySelector('[name="notes"]')
      const bv = uploadForm.querySelector('[name="bundleVersion"]')
      const vc = uploadForm.querySelector('[name="versionCode"]')
      const mnc = uploadForm.querySelector('[name="minNativeVersionCode"]')
      if (f) f.value = ''
      if (v) v.value = ''
      if (n) n.value = ''
      if (bv) bv.value = ''
      if (vc) vc.value = ''
      if (mnc) mnc.value = ''
      dateInput.value = new Date().toISOString().slice(0, 10)
      await loadReleases()
    } catch (e) {
      uploadMsg.textContent = e instanceof Error ? e.message : '网络错误'
      uploadMsg.classList.add('err')
    } finally {
      btn.disabled = false
    }
  })
}

async function main() {
  await setupAdmin()
  await loadReleases()
}

main()
