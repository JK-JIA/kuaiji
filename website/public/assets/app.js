/** @type {boolean} */
let uploadEnabled = false

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
        '暂无版本。使用下方上传，或在服务器上向 <code>downloads/</code> 放 APK 并编辑 <code>releases.json</code>。' +
        '<br /><span class="hint-muted">仅删 APK 文件不会更新列表，需同步改 releases.json 或使用「删除」按钮。</span>'
      errEl.classList.remove('hidden')
      return
    }

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
        const deleteBtn = uploadEnabled
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

function getManageToken() {
  return (
    document.querySelector('#upload-form input[name="token"]')?.value?.trim() ||
    ''
  )
}

async function deleteRelease(file) {
  const token = getManageToken()
  if (!token) {
    window.alert('请先在「上传新版本 APK」里填写「上传令牌」后再删除。')
    return
  }
  if (
    !window.confirm(
      `确定删除「${file}」？\n将从下载列表移除，并尝试删除服务器上的文件（若仍存在）。`,
    )
  ) {
    return
  }
  try {
    const res = await fetch('/api/release/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, file }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      window.alert(j.error || `删除失败（HTTP ${res.status}）`)
      return
    }
    await loadReleases()
  } catch (e) {
    window.alert(e instanceof Error ? e.message : '网络错误')
  }
}

async function setupUpload() {
  const disabledHint = document.getElementById('upload-disabled')
  const form = document.getElementById('upload-form')
  const dateInput = document.getElementById('upload-date')
  const msg = document.getElementById('upload-msg')

  dateInput.value = new Date().toISOString().slice(0, 10)

  try {
    const h = await fetch('/api/health', { cache: 'no-store' })
    const j = h.ok ? await h.json() : {}
    uploadEnabled = Boolean(j.uploadEnabled)
    if (uploadEnabled) {
      disabledHint.classList.add('hidden')
      form.classList.remove('hidden')
    } else {
      disabledHint.classList.remove('hidden')
      form.classList.add('hidden')
    }
  } catch {
    uploadEnabled = false
    disabledHint.textContent =
      '无法检测上传服务。若已配置 UPLOAD_TOKEN，请刷新重试。'
    disabledHint.classList.remove('hidden')
    form.classList.add('hidden')
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    msg.textContent = ''
    msg.classList.remove('ok', 'err')
    const btn = form.querySelector('.btn-submit')
    btn.disabled = true
    try {
      const fd = new FormData(form)
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: fd,
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        msg.textContent = j.error || `上传失败（HTTP ${res.status}）`
        msg.classList.add('err')
        return
      }
      msg.textContent = '已发布，列表已更新。'
      msg.classList.add('ok')
      form.reset()
      dateInput.value = new Date().toISOString().slice(0, 10)
      await loadReleases()
    } catch (e) {
      msg.textContent = e instanceof Error ? e.message : '网络错误'
      msg.classList.add('err')
    } finally {
      btn.disabled = false
    }
  })
}

async function main() {
  await setupUpload()
  await loadReleases()
}

main()
