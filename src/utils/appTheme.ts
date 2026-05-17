export const THEME_STORAGE_KEY = 'kuaiji_theme_mode'

export type ThemeMode = 'light' | 'dark' | 'system'

const ORDER: ThemeMode[] = ['light', 'dark', 'system']

const META_THEME_LIGHT = '#f8f9fa'
const META_THEME_DARK = '#0c0c0f'

function clampMode(raw: string | null): ThemeMode {
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  return 'system'
}

export function readThemeMode(): ThemeMode {
  try {
    return clampMode(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

function syncMetaThemeColor(dark: boolean): void {
  if (typeof document === 'undefined') return
  const meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) return
  const color = dark ? META_THEME_DARK : META_THEME_LIGHT
  meta.setAttribute('content', color)
}

export function persistThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
  applyThemeMode(mode)
}

export function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

export function isDarkEffective(mode: ThemeMode): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return systemPrefersDark()
}

export function applyThemeMode(mode: ThemeMode): void {
  const root = document.documentElement
  const dark = isDarkEffective(mode)
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
  syncMetaThemeColor(dark)
}

export function themeModeLabel(mode: ThemeMode): string {
  if (mode === 'light') return '浅色'
  if (mode === 'dark') return '深色'
  return '跟随系统'
}

export function cycleThemeMode(current: ThemeMode): ThemeMode {
  const i = ORDER.indexOf(current)
  return ORDER[(i + 1) % ORDER.length]!
}

/** 首屏防闪：在 React 挂载前应用主题（index.html 内联脚本也会调用同等逻辑） */
export function applyThemeFromStorage(): void {
  applyThemeMode(readThemeMode())
}

export function initTheme(): () => void {
  applyThemeFromStorage()
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    if (readThemeMode() === 'system') applyThemeMode('system')
  }
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
