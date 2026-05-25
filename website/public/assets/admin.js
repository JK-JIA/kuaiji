const TOKEN_KEY = 'kuaiji_site_admin_token'

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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmtTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-CN')
  } catch {
    return iso
  }
}

function latestApkRelease(items) {
  if (!Array.isArray(items)) return null
  for (const row of items) {
    if (String(row?.file ?? '').trim()) return row
  }
  return null
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

function kindLabel(row) {
  const k = rowKind(row)
  if (k === 'both') return { text: '整包+热更', cls: 'release-kind' }
  if (k === 'hot') return { text: '热更新 zip', cls: 'release-kind hot' }
  return { text: '整包 APK', cls: 'release-kind' }
}

let uploadEnabled = false
let statsEnabled = false
let healthInfo = {}
let overviewCache = null

function showDashboard(loggedIn) {
  document.getElementById('login-card').classList.toggle('hidden', loggedIn)
  document.getElementById('dashboard').classList.toggle('hidden', !loggedIn)
  document.getElementById('btn-logout').classList.toggle('hidden', !loggedIn)
}

function statsConfigHintHtml() {
  const parts = []
  if (!healthInfo.ledgerApiConfigured) {
    parts.push(
      '<code>LEDGER_API_URL=http://host.docker.internal:3001</code>（Docker 部署；勿用 127.0.0.1）',
    )
  }
  if (!healthInfo.ledgerTokenConfigured) {
    parts.push('<code>LEDGER_ADMIN_TOKEN=</code>随机长串（与 ledger-api 的 <code>WEBSITE_ADMIN_TOKEN</code> 相同）')
  }
  const websiteEnv = parts.length
    ? `<p style="margin:6px 0 0">在 <code>~/kuaiji/website/.env</code> 设置：<br>${parts.join('<br>')}</p>`
    : ''
  return `<div class="config-hint"><strong>业务数据未接通</strong>${websiteEnv}
<p style="margin:6px 0 0">在 <code>~/kuaiji/server/.env</code>（或根目录 compose 环境）增加：<br><code>WEBSITE_ADMIN_TOKEN=</code>与上面 <code>LEDGER_ADMIN_TOKEN</code> 相同的值</p>
<p style="margin:6px 0 0">保存后执行：<code>docker compose up -d --build api</code>（项目根目录）与 <code>cd website && docker compose up -d --build uploader</code>，再点「刷新」。</p></div>`
}

async function checkHealth() {
  try {
    const res = await fetch('/api/health')
    const data = await res.json()
    uploadEnabled = Boolean(data.uploadEnabled)
    statsEnabled = Boolean(data.statsEnabled)
    healthInfo = {
      ledgerApiConfigured: Boolean(data.ledgerApiConfigured),
      ledgerTokenConfigured: Boolean(data.ledgerTokenConfigured),
    }
    if (!uploadEnabled) {
      document.getElementById('upload-off').classList.remove('hidden')
    }
  } catch {
    /* ignore */
  }
}

async function login(token) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `登录失败 (${res.status})`)
  setStoredToken(token)
  showDashboard(true)
  await loadReleases()
}

async function loadReleases() {
  const currentEl = document.getElementById('current-release')
  const loadingEl = document.getElementById('releases-loading')
  const errEl = document.getElementById('releases-error')
  const listEl = document.getElementById('releases-list')

  loadingEl.classList.remove('hidden')
  errEl.classList.add('hidden')
  errEl.textContent = ''
  listEl.classList.add('hidden')

  try {
    const res = await fetch('/releases.json', { cache: 'no-store' })
    if (!res.ok) throw new Error(`无法读取 releases.json（HTTP ${res.status}）`)
    const data = await res.json()
    const items = Array.isArray(data.items) ? data.items : []
    const latest = latestApkRelease(items)

    if (!latest) {
      currentEl.textContent = '官网当前无 APK 发布记录。'
    } else {
      const file = String(latest.file ?? '')
      currentEl.innerHTML = `官网最新：<strong>${escapeHtml(latest.version || '')}</strong> · ${escapeHtml(file)} · ${escapeHtml(latest.date || '')}`
    }

    loadingEl.classList.add('hidden')

    if (items.length === 0) {
      errEl.textContent = '暂无历史版本。上传 APK 或 zip 后将显示在此。'
      errEl.classList.remove('hidden')
      return
    }

    const loggedIn = Boolean(getStoredToken())
    listEl.innerHTML = items
      .map((row) => {
        const ver = escapeHtml(row.version ?? '')
        const date = escapeHtml(row.date ?? '')
        const channel = row.channel ? escapeHtml(String(row.channel)) : ''
        const notes = row.notes ? escapeHtml(String(row.notes)) : ''
        const file = String(row.file ?? '').trim()
        const bundle = String(row.bundle ?? '').trim()
        const meta = [date, channel].filter(Boolean).join(' · ')
        const kind = kindLabel(row)
        const delTarget = deleteTargetForRow(row)
        const deleteBtn =
          loggedIn && delTarget
            ? `<button type="button" class="btn-del" data-target="${encodeURIComponent(delTarget)}">删除</button>`
            : ''
        const fileLines = [
          file
            ? `<p class="release-file"><span class="release-kind">APK</span> <code>${escapeHtml(file)}</code></p>`
            : '',
          bundle
            ? `<p class="release-file"><span class="release-kind hot">zip</span> <code>${escapeHtml(bundle)}</code></p>`
            : '',
        ]
          .filter(Boolean)
          .join('')
        const dlBtns = [
          file
            ? `<a href="/downloads/${encodeURIComponent(file)}" download>下载 APK</a>`
            : '',
          bundle
            ? `<a href="/downloads/${encodeURIComponent(bundle)}" download>下载热更包</a>`
            : '',
        ]
          .filter(Boolean)
          .join('')
        return `<li class="release-item">
          <div class="release-item-top">
            <span class="release-ver">v${ver}</span>
            <span class="${kind.cls}">${kind.text}</span>
            ${meta ? `<span class="release-meta">${meta}</span>` : ''}
          </div>
          ${fileLines || '<p class="release-file">（无文件字段）</p>'}
          ${notes ? `<p class="release-notes">${notes}</p>` : ''}
          <div class="release-actions">${dlBtns || ''}${deleteBtn}</div>
        </li>`
      })
      .join('')

    listEl.querySelectorAll('.btn-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const raw = btn.getAttribute('data-target')
        const f = raw ? decodeURIComponent(raw) : ''
        if (f) void deleteRelease(f)
      })
    })

    listEl.classList.remove('hidden')
  } catch (e) {
    loadingEl.classList.add('hidden')
    currentEl.textContent = ''
    errEl.textContent = e instanceof Error ? e.message : '加载失败'
    errEl.classList.remove('hidden')
  }
}

async function deleteRelease(target) {
  if (!getStoredToken()) {
    window.alert('请先登录。')
    return
  }
  if (
    !window.confirm(
      `确定删除「${target}」？\n将从列表移除，并删除服务器上对应文件（若存在）。`,
    )
  ) {
    return
  }
  try {
    const res = await fetch('/api/release/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ target }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.status === 401) {
      setStoredToken('')
      showDashboard(false)
      window.alert('登录已失效，请重新登录。')
      return
    }
    if (!res.ok) {
      window.alert(data.error || `删除失败（HTTP ${res.status}）`)
      return
    }
    await loadReleases()
  } catch (e) {
    window.alert(e instanceof Error ? e.message : '网络错误')
  }
}

async function uploadApk(form) {
  const fd = new FormData(form)
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: authHeader(),
    body: fd,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `上传失败 (${res.status})`)
  return data
}

async function fetchOverview() {
  const res = await fetch('/api/admin/overview', { headers: authHeader() })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `拉取失败 (${res.status})`)
  return data
}

function renderStats(o) {
  const grid = document.getElementById('stats-grid')
  const boxes = [
    ['usersTotal', '注册用户'],
    ['usersWithPhone', '已绑手机'],
    ['ledgerCount', '账本数'],
    ['membershipActiveCount', '有效会员'],
    ['membershipExpiredCount', '已过期会员'],
    ['membershipOrdersPaid', '已支付订单'],
    ['membershipOrdersPending', '待支付订单'],
  ]
  grid.innerHTML = boxes
    .map(
      ([k, label]) =>
        `<div class="stat-box"><div class="n">${escapeHtml(o[k] ?? 0)}</div><div class="l">${label}</div></div>`,
    )
    .join('')
  const msg = document.getElementById('stats-msg')
  msg.innerHTML = `数据更新时间：${escapeHtml(fmtTime(o.generatedAt))}`
  msg.classList.remove('err')
}

function renderOrders(o) {
  const tbody = document.querySelector('#orders-table tbody')
  const rows = Array.isArray(o.recentOrders) ? o.recentOrders : []
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6">暂无订单</td></tr>'
    return
  }
  tbody.innerHTML = rows
    .map((r) => {
      const st = r.status === 'paid' ? '已支付' : r.status === 'pending' ? '待支付' : r.status
      const cls = r.status === 'paid' ? 'ok' : 'off'
      return `<tr>
        <td><code>${escapeHtml(r.outTradeNo || '')}</code></td>
        <td>${escapeHtml(r.planId || '')}</td>
        <td>${escapeHtml(r.amountYuan ?? '')} 元</td>
        <td><span class="badge ${cls}">${escapeHtml(st)}</span></td>
        <td>${escapeHtml(fmtTime(r.paidAt))}</td>
        <td>${escapeHtml(fmtTime(r.createdAt))}</td>
      </tr>`
    })
    .join('')
}

function renderMembers(o) {
  const tbody = document.querySelector('#members-table tbody')
  const rows = Array.isArray(o.members) ? o.members : []
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4">暂无会员记录</td></tr>'
    return
  }
  tbody.innerHTML = rows
    .map((m) => {
      const cls = m.active ? 'ok' : 'off'
      const st = m.active ? '有效' : '已过期'
      return `<tr>
        <td>${escapeHtml(m.phone || '—')}</td>
        <td>${escapeHtml(m.email || '')}</td>
        <td>${escapeHtml(fmtTime(m.membershipExpiresAt))}</td>
        <td><span class="badge ${cls}">${st}</span></td>
      </tr>`
    })
    .join('')
}

function showStatsConfigError(targetEl) {
  targetEl.innerHTML = statsConfigHintHtml()
  targetEl.classList.add('err')
}

async function loadOverviewPanels() {
  const statsMsg = document.getElementById('stats-msg')
  const ordersMsg = document.getElementById('orders-msg')
  const membersMsg = document.getElementById('members-msg')
  const statsGrid = document.getElementById('stats-grid')

  if (!statsEnabled) {
    statsGrid.innerHTML = ''
    showStatsConfigError(statsMsg)
    ordersMsg.innerHTML = ''
    membersMsg.innerHTML = ''
    return
  }

  statsMsg.textContent = '加载中…'
  statsMsg.classList.remove('err')
  ordersMsg.textContent = ''
  membersMsg.textContent = ''
  try {
    overviewCache = await fetchOverview()
    renderStats(overviewCache)
    renderOrders(overviewCache)
    renderMembers(overviewCache)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '加载失败'
    statsGrid.innerHTML = ''
    statsMsg.textContent = msg
    statsMsg.classList.add('err')
    ordersMsg.textContent = msg
    ordersMsg.classList.add('err')
    membersMsg.textContent = msg
    membersMsg.classList.add('err')
  }
}

function switchTab(name) {
  document.querySelectorAll('.admin-tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === name)
  })
  document.querySelectorAll('.admin-panel').forEach((p) => {
    p.classList.toggle('active', p.id === `panel-${name}`)
  })
  if (name !== 'upload' && overviewCache === null && statsEnabled) {
    loadOverviewPanels()
  }
}

document.getElementById('login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault()
  const msg = document.getElementById('login-msg')
  msg.textContent = ''
  msg.classList.remove('err')
  const token = document.getElementById('login-token').value.trim()
  try {
    await login(token)
    msg.textContent = '登录成功'
    if (statsEnabled) loadOverviewPanels()
  } catch (e) {
    msg.textContent = e instanceof Error ? e.message : '登录失败'
    msg.classList.add('err')
  }
})

document.getElementById('btn-logout').addEventListener('click', () => {
  setStoredToken('')
  overviewCache = null
  showDashboard(false)
  document.getElementById('login-token').value = ''
  loadReleases()
})

document.getElementById('upload-form').addEventListener('submit', async (ev) => {
  ev.preventDefault()
  const msg = document.getElementById('upload-msg')
  msg.textContent = ''
  msg.classList.remove('err')
  if (!uploadEnabled) {
    msg.textContent = '上传未启用'
    msg.classList.add('err')
    return
  }
  const form = ev.target
  const btn = form.querySelector('button[type="submit"]')
  btn.disabled = true
  try {
    await uploadApk(form)
    msg.textContent = '发布成功，官网已指向此版本'
    form.reset()
    await loadReleases()
  } catch (e) {
    msg.textContent = e instanceof Error ? e.message : '上传失败'
    msg.classList.add('err')
  } finally {
    btn.disabled = false
  }
})

document.querySelectorAll('.admin-tab').forEach((b) => {
  b.addEventListener('click', () => switchTab(b.dataset.tab))
})

document.getElementById('btn-refresh-stats').addEventListener('click', () => {
  overviewCache = null
  loadOverviewPanels()
})

checkHealth().then(() => {
  if (getStoredToken()) {
    showDashboard(true)
    loadReleases()
    if (statsEnabled) loadOverviewPanels()
    else {
      const statsMsg = document.getElementById('stats-msg')
      showStatsConfigError(statsMsg)
    }
  }
})
