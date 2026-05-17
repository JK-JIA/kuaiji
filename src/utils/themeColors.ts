import { useEffect, useState } from 'react'

/** 从 CSS 变量读取当前主题色（供 Recharts 等无法使用 Tailwind 的场景） */

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  return v || fallback
}

export function getThemeColors() {
  return {
    bg: cssVar('--kj-bg', '#f8f9fa'),
    surface: cssVar('--kj-surface', '#ffffff'),
    textPrimary: cssVar('--kj-text-primary', '#1c1917'),
    textSecondary: cssVar('--kj-text-secondary', '#666666'),
    textMuted: cssVar('--kj-text-muted', '#999999'),
    border: cssVar('--kj-border-strong', '#e7e5e4'),
    brand: cssVar('--kj-brand', '#2ecc71'),
    chartGrid: cssVar('--kj-chart-grid', '#e7e5e4'),
    chartAxis: cssVar('--kj-chart-axis', '#666666'),
    tooltipBg: cssVar('--kj-tooltip-bg', '#ffffff'),
    tooltipBorder: cssVar('--kj-tooltip-border', '#e7e5e4'),
  }
}

export type ThemeColors = ReturnType<typeof getThemeColors>

/** 主题切换时自动刷新（供图表轴、tooltip 等） */
export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState(getThemeColors)
  useEffect(() => {
    const sync = () => setColors(getThemeColors())
    const obs = new MutationObserver(sync)
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', sync)
    return () => {
      obs.disconnect()
      mq.removeEventListener('change', sync)
    }
  }, [])
  return colors
}
