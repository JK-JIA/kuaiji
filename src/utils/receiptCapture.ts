import html2canvas from 'html2canvas'
import {
  receiptImageMime,
  receiptImageQuality,
} from './receiptExport'

/**
 * 在独立 iframe 文档中截图，避免主页面 Tailwind v4 的 oklch() 进入 html2canvas。
 * 使用 `importNode` 把真实节点迁入 iframe，避免 Android WebView 对 `outerHTML` 再解析时
 * 出现 body 下无节点，导致「小票克隆失败」。
 */
export async function html2canvasReceiptElement(
  el: HTMLElement,
  options: {
    scale?: number
    backgroundColor?: string | null
  } = {},
): Promise<HTMLCanvasElement> {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText =
    'position:fixed;left:-9999px;top:0;width:400px;height:1600px;border:0;opacity:0;pointer-events:none;visibility:hidden'

  document.body.appendChild(iframe)

  try {
    const doc = iframe.contentDocument
    if (!doc) throw new Error('iframe 文档不可用')

    doc.open()
    doc.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8">' +
        '<style>html,body{margin:0;padding:0;background:#ffffff}</style></head><body></body></html>',
    )
    doc.close()

    if (!doc.body) {
      throw new Error('小票克隆失败：iframe 无 body')
    }

    const clone = doc.importNode(el, true)
    // 不可对跨 iframe 的节点用「父页面」的 instanceof HTMLElement，在 WebView 里恒为 false
    if (clone.nodeType !== Node.ELEMENT_NODE) {
      throw new Error('小票克隆失败')
    }
    const target = clone as HTMLElement
    doc.body.appendChild(target)

    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )

    return await html2canvas(target, {
      scale: options.scale ?? 1.25,
      backgroundColor: options.backgroundColor ?? '#ffffff',
      useCORS: true,
      allowTaint: false,
      imageTimeout: 0,
      logging: false,
    })
  } finally {
    iframe.remove()
  }
}

/** 小票 DOM → JPEG Blob（体积小、编码快于 PNG；无跨域图） */
export async function captureReceiptJpegBlob(
  el: HTMLElement,
  scale: number,
): Promise<Blob | null> {
  const canvas = await html2canvasReceiptElement(el, {
    scale,
    backgroundColor: '#ffffff',
  })
  return new Promise((resolve) => {
    canvas.toBlob(
      (b) => resolve(b),
      receiptImageMime,
      receiptImageQuality,
    )
  })
}
