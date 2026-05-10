/** localStorage 键；若改键名需同步修改 index.html 内联引导脚本 */
export const FONT_SIZE_STORAGE_KEY = 'kuaiji_ui_font_pct'

export const FONT_SIZE_MIN = 85
export const FONT_SIZE_MAX = 150
export const FONT_SIZE_DEFAULT = 100
export const FONT_SIZE_STEP = 5

function clampAndStep(pct: number): number {
  const stepped = Math.round(pct / FONT_SIZE_STEP) * FONT_SIZE_STEP
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, stepped))
}

export function readFontSizePercent(): number {
  try {
    const raw = localStorage.getItem(FONT_SIZE_STORAGE_KEY)
    if (raw == null) return FONT_SIZE_DEFAULT
    const n = Number(raw)
    if (!Number.isFinite(n)) return FONT_SIZE_DEFAULT
    return clampAndStep(n)
  } catch {
    return FONT_SIZE_DEFAULT
  }
}

/** 写入并立即应用到 <html>（Tailwind rem 随根字号缩放） */
export function persistFontSizePercent(pct: number): void {
  const v = clampAndStep(pct)
  try {
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(v))
  } catch {
    /* ignore quota / private mode */
  }
  applyFontSizePercentToHtml(v)
}

export function applyFontSizePercentToHtml(pct: number): void {
  document.documentElement.style.fontSize = `${clampAndStep(pct)}%`
}
