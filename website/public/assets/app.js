async function main() {
  const loading = document.getElementById('loading')
  const errEl = document.getElementById('error')
  const list = document.getElementById('list')

  try {
    const res = await fetch('/releases.json', { cache: 'no-store' })
    if (!res.ok) throw new Error(`无法读取 releases.json（HTTP ${res.status}）`)
    const data = await res.json()
    const items = Array.isArray(data.items) ? data.items : []

    loading.classList.add('hidden')

    if (items.length === 0) {
      errEl.textContent =
        '暂无版本。请将 APK 放入 downloads/ 并编辑 public/releases.json。'
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

main()
