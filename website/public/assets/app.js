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
        '<br /><span class="hint-muted">仅删除 APK 文件不会更新列表，需改 JSON 或使用管理后台「删除」。</span>'
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
        const file = String(row.file ?? '')
        const fileEsc = escapeHtml(file)
        const href = `/downloads/${encodeURIComponent(file)}`
        const meta = [date, channel].filter(Boolean).join(' · ')
        const deleteBtn = showDel
          ? `<button type="button" class="btn-del" data-file="${encodeURIComponent(file)}">删除</button>`
          : ''
        return `<li class="item">
          <div class="item-top">
            <span class="ver">v${ver}</span>
            ${meta ? `<span class="meta">${meta}</span>` : ''}
          </div>
          <p class="file-line"><code>${fileEsc}</code></p>
          ${notes ? `<p class="notes">${notes}</p>` : ''}
          <div class="item-actions">
            <a class="btn" href="${href}" download>下载 APK</a>
            ${deleteBtn}
          </div>
        </li>`
      })
      .join('')

    list.querySelectorAll('.btn-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const raw = btn.getAttribute('data-file')
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

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function deleteRelease(file) {
  if (!isAdminLoggedIn()) {
    window.alert('请先登录管理后台。')
    return
  }
  if (
    !window.confirm(
      `确定删除「${file}」？\n将从列表移除，并删除服务器上的 APK（若仍存在）。`,
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
      body: JSON.stringify({ file }),
    })
    const j = await res.json().catch(() => ({}))
    if (res.status === 401) {
      setStoredToken('')
      showLoginView()
      await loadReleases()
      window.alert('登录已失效，请重新登录。')
      return
    }
    if (!res.ok) {
      window.alert(j.error || `删除失败（HTTP ${res.status}）`)
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
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        loginMsg.textContent = j.error || `登录失败（HTTP ${res.status}）`
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
      uploadMsg.textContent = '已发布，可继续上传下一版。'
      uploadMsg.classList.add('ok')
      const v = uploadForm.querySelector('[name="version"]')
      const f = uploadForm.querySelector('[name="file"]')
      const n = uploadForm.querySelector('[name="notes"]')
      if (f) f.value = ''
      if (v) v.value = ''
      if (n) n.value = ''
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
