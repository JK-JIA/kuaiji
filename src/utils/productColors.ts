import type { ProductCatalogEntry } from '../types'
import { lookupCatalogEntryForProduct } from './productCatalogHelpers'
import type { ReceiptProductColor } from './receiptCanvasShared'
import { normalizeToken } from './voiceHistoryFuzzy'

export type ProductColorPreset = {
  tagBg: string
  tagText: string
  chart: string
}

/** 商品展示用 24 色（标签浅底 + 图表实色） */
export const PRODUCT_COLOR_PRESETS: ProductColorPreset[] = [
  { tagBg: '#ffedd5', tagText: '#c2410c', chart: '#f97316' },
  { tagBg: '#ede9fe', tagText: '#6d28d9', chart: '#8b5cf6' },
  { tagBg: '#dbeafe', tagText: '#1d4ed8', chart: '#3b82f6' },
  { tagBg: '#dcfce7', tagText: '#15803d', chart: '#22c55e' },
  { tagBg: '#fce7f3', tagText: '#be185d', chart: '#ec4899' },
  { tagBg: '#fef3c7', tagText: '#b45309', chart: '#f59e0b' },
  { tagBg: '#fee2e2', tagText: '#b91c1c', chart: '#ef4444' },
  { tagBg: '#ccfbf1', tagText: '#0f766e', chart: '#14b8a6' },
  { tagBg: '#e0e7ff', tagText: '#4338ca', chart: '#6366f1' },
  { tagBg: '#f3e8ff', tagText: '#7e22ce', chart: '#a855f7' },
  { tagBg: '#ecfccb', tagText: '#4d7c0f', chart: '#84cc16' },
  { tagBg: '#cffafe', tagText: '#0e7490', chart: '#06b6d4' },
  { tagBg: '#ffe4e6', tagText: '#e11d48', chart: '#f43f5e' },
  { tagBg: '#f5f5f4', tagText: '#44403c', chart: '#78716c' },
  { tagBg: '#fef9c3', tagText: '#a16207', chart: '#eab308' },
  { tagBg: '#d1fae5', tagText: '#047857', chart: '#10b981' },
  { tagBg: '#e2e8f0', tagText: '#334155', chart: '#64748b' },
  { tagBg: '#fae8ff', tagText: '#a21caf', chart: '#d946ef' },
  { tagBg: '#ffedd5', tagText: '#9a3412', chart: '#ea580c' },
  { tagBg: '#ddd6fe', tagText: '#5b21b6', chart: '#7c3aed' },
  { tagBg: '#bfdbfe', tagText: '#1e40af', chart: '#2563eb' },
  { tagBg: '#bbf7d0', tagText: '#166534', chart: '#16a34a' },
  { tagBg: '#fbcfe8', tagText: '#9d174d', chart: '#db2777' },
  { tagBg: '#fde68a', tagText: '#92400e', chart: '#ca8a04' },
]

export const PRODUCT_COLOR_COUNT = PRODUCT_COLOR_PRESETS.length

export function normalizeProductColorKey(key: unknown): number | undefined {
  if (key === undefined || key === null || key === '') return undefined
  const n = typeof key === 'number' ? key : parseInt(String(key), 10)
  if (!Number.isFinite(n)) return undefined
  const i = Math.floor(n)
  if (i < 0 || i >= PRODUCT_COLOR_COUNT) return undefined
  return i
}

export function colorPresetByKey(key: number): ProductColorPreset {
  const i = normalizeProductColorKey(key) ?? 0
  return PRODUCT_COLOR_PRESETS[i]!
}

/** 未配置颜色时按商品名稳定取色 */
export function defaultColorKeyForName(productName: string): number {
  const k = normalizeToken(productName)
  if (!k) return 0
  let h = 0
  for (let i = 0; i < k.length; i += 1) {
    h = (Math.imul(31, h) + k.charCodeAt(i)) >>> 0
  }
  return h % PRODUCT_COLOR_COUNT
}

export function resolveProductColorKey(
  productName: string,
  catalog: ProductCatalogEntry[],
): number {
  const entry = lookupCatalogEntryForProduct(productName, catalog)
  const fromEntry = normalizeProductColorKey(entry?.colorKey)
  if (fromEntry != null) return fromEntry
  return defaultColorKeyForName(productName)
}

export function getProductChartColor(
  productName: string,
  catalog: ProductCatalogEntry[],
  fallbackIndex = 0,
): string {
  const key = resolveProductColorKey(productName, catalog)
  if (key != null) return colorPresetByKey(key).chart
  return PRODUCT_COLOR_PRESETS[fallbackIndex % PRODUCT_COLOR_COUNT]!.chart
}

export function getProductReceiptColor(
  productName: string,
  catalog: ProductCatalogEntry[],
  fallbackIndex = 0,
): ReceiptProductColor {
  const preset = colorPresetByKey(
    resolveProductColorKey(productName, catalog) ??
      fallbackIndex % PRODUCT_COLOR_COUNT,
  )
  return { tagBg: preset.tagBg, tagText: preset.tagText }
}

export function buildProductReceiptColorMap(
  names: string[],
  catalog: ProductCatalogEntry[],
): Map<string, ReceiptProductColor> {
  const map = new Map<string, ReceiptProductColor>()
  for (const raw of names) {
    const name = raw.trim() || '未填写商品'
    if (map.has(name)) continue
    map.set(name, getProductReceiptColor(name, catalog, map.size))
  }
  return map
}

/** 新建商品时优先选尚未使用的色 */
export function pickUnusedColorKey(catalog: ProductCatalogEntry[]): number {
  const used = new Set<number>()
  for (const e of catalog) {
    const k = normalizeProductColorKey(e.colorKey)
    if (k != null) used.add(k)
  }
  for (let i = 0; i < PRODUCT_COLOR_COUNT; i += 1) {
    if (!used.has(i)) return i
  }
  return catalog.length % PRODUCT_COLOR_COUNT
}
