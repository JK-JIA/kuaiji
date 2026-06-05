const form = document.getElementById('report-form')
const msg = document.getElementById('report-msg')
const submitBtn = document.getElementById('report-submit')

function setMsg(text, kind) {
  if (!msg) return
  msg.textContent = text
  msg.classList.remove('ok', 'err')
  if (kind) msg.classList.add(kind)
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault()
  if (!form || !submitBtn) return

  const fd = new FormData(form)
  const body = {
    category: String(fd.get('category') || '').trim(),
    url: String(fd.get('url') || '').trim(),
    content: String(fd.get('content') || '').trim(),
    reporterName: String(fd.get('reporterName') || '').trim(),
    contact: String(fd.get('contact') || '').trim(),
    website: String(fd.get('website') || '').trim(),
  }

  if (!body.category) {
    setMsg('请选择举报类型', 'err')
    return
  }
  if (body.content.length < 10) {
    setMsg('举报说明不少于 10 字', 'err')
    return
  }

  submitBtn.disabled = true
  setMsg('正在提交…', '')

  try {
    const r = await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      setMsg(data.error || '提交失败，请稍后重试', 'err')
      return
    }
    setMsg(data.message || '举报已提交，感谢您的反馈。', 'ok')
    form.reset()
  } catch {
    setMsg('网络异常，请稍后重试', 'err')
  } finally {
    submitBtn.disabled = false
  }
})
