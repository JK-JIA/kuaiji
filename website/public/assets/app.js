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
      errEl.textContent =
        '暂无版本。使用下方上传，或在服务器上向 downloads/ 放 APK 并编辑 releases.json。'
      errEl.classList.remove('hidden')
      return
    }

    list.innerHTML = items
      .map((row) => {
        const ver = escapeHtml(row.version ?? '')
        const date = escapeHtml(row.date ?? '')
        const channel = row.channel ? escapeHtml(String(row.channel)) : ''
        const notes = row.notes ? escapeHtml(String(row.notes)) : ''
        const href = `/downloads/${encodeURIComponent(row.file)}`
        const meta = [date, channel].filter(Boolean).join(' · ')
        return `<li class="item">
          <div class="item-top">
            <span class="ver">v${ver}</span>
            ${meta ? `<span class="meta">${meta}</span>` : ''}
          </div>
          ${notes ? `<p class="notes">${notes}</p>` : ''}
          <a class="btn" href="${href}" download>下载 APK</a>
        </li>`
      })
      .join('')

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

async function setupUpload() {
  const disabledHint = document.getElementById('upload-disabled')
  const form = document.getElementById('upload-form')
  const dateInput = document.getElementById('upload-date')
  const msg = document.getElementById('upload-msg')

  dateInput.value = new Date().toISOString().slice(0, 10)

  try {
    const h = await fetch('/api/health', { cache: 'no-store' })
    const j = h.ok ? await h.json() : {}
    if (j.uploadEnabled) {
      disabledHint.classList.add('hidden')
      form.classList.remove('hidden')
    } else {
      disabledHint.classList.remove('hidden')
      form.classList.add('hidden')
    }
  } catch {
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
