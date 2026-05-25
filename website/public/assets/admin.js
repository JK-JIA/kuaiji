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

let uploadEnabled = false
let statsEnabled = false
let overviewCache = null

function showDashboard(loggedIn) {
  document.getElementById('login-card').classList.toggle('hidden', loggedIn)
  document.getElementById('dashboard').classList.toggle('hidden', !loggedIn)
  document.getElementById('btn-logout').classList.toggle('hidden', !loggedIn)
}

async function checkHealth() {
  try {
    const res = await fetch('/api/health')
    const data = await res.json()
    uploadEnabled = Boolean(data.uploadEnabled)
    statsEnabled = Boolean(data.statsEnabled)
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
  await loadCurrentRelease()
}

async function loadCurrentRelease() {
  const el = document.getElementById('current-release')
  try {
    const res = await fetch('/releases.json', { cache: 'no-store' })
    const data = await res.json()
    const latest = latestApkRelease(data.items)
    if (!latest) {
      el.textContent = '官网当前无 APK 发布记录。'
      return
    }
    const file = String(latest.file ?? '')
    el.innerHTML = `官网最新：<strong>${escapeHtml(latest.version || '')}</strong> · ${escapeHtml(file)} · ${escapeHtml(latest.date || '')}`
  } catch {
    el.textContent = '无法读取 releases.json'
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
  msg.textContent = `数据更新时间：${fmtTime(o.generatedAt)}`
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

async function loadOverviewPanels() {
  const statsMsg = document.getElementById('stats-msg')
  const ordersMsg = document.getElementById('orders-msg')
  const membersMsg = document.getElementById('members-msg')

  if (!statsEnabled) {
    const err = '未配置 LEDGER_API_URL / LEDGER_ADMIN_TOKEN，无法显示业务数据。请在 website/.env 与 ledger-api 配置 WEBSITE_ADMIN_TOKEN。'
    statsMsg.textContent = err
    statsMsg.classList.add('err')
    ordersMsg.textContent = err
    membersMsg.textContent = err
    return
  }

  statsMsg.textContent = '加载中…'
  try {
    overviewCache = await fetchOverview()
    renderStats(overviewCache)
    renderOrders(overviewCache)
    renderMembers(overviewCache)
    ordersMsg.textContent = ''
    membersMsg.textContent = ''
  } catch (e) {
    const msg = e instanceof Error ? e.message : '加载失败'
    statsMsg.textContent = msg
    statsMsg.classList.add('err')
    ordersMsg.textContent = msg
    membersMsg.textContent = msg
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
    await loadCurrentRelease()
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
    loadCurrentRelease()
    if (statsEnabled) loadOverviewPanels()
  }
})
