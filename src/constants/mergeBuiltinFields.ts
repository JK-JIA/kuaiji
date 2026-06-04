import type { FieldDef } from '../types'
import { getDefaultFieldDefs } from './defaultLedgerFields'

export function getBuiltinFieldDefault(
  key: NonNullable<FieldDef['key']>,
): Pick<FieldDef, 'name' | 'type'> & { required?: boolean } {
  const def = getDefaultFieldDefs().find((f) => f.key === key)
  return {
    name: def?.name ?? '',
    type: def?.type ?? 'text',
    required: false,
  }
}

/** 相对内置默认是否被用户改过（改名或勾选必填） */
export function isBuiltinFieldCustomized(f: FieldDef): boolean {
  if (!f.key) return false
  const def = getBuiltinFieldDefault(f.key)
  return f.name.trim() !== def.name.trim() || f.required === true
}

export function applyBuiltinFieldDefaults(f: FieldDef): FieldDef {
  if (!f.key) return f
  const def = getBuiltinFieldDefault(f.key)
  return { ...f, name: def.name, type: def.type, required: false }
}

/** 仅保留系统默认 5 列（清空自定义列与重复项） */
export function restoreAllBuiltinFields(): FieldDef[] {
  return getDefaultFieldDefs().map((f) => applyBuiltinFieldDefaults({ ...f }))
}

export function isBuiltinFieldsLayoutCustomized(fields: FieldDef[]): boolean {
  const defaults = getDefaultFieldDefs()
  if (fields.length !== defaults.length) return true
  if (fields.some((f) => !f.key)) return true
  for (const def of defaults) {
    const cur = fields.find((f) => f.key === def.key)
    if (!cur || isBuiltinFieldCustomized(cur)) return true
  }
  return false
}

/** 数量列旧名「斤数」或「数量(斤)」等 → 统一为「数量」（单位随商品目录展示） */
export function normalizeQuantityFieldLabel(name: string): string {
  const t = String(name ?? '').trim()
  if (t === '斤数') return '数量'
  const stripped = t
    .replace(/\s*[\(（]\s*斤\s*[\)）]\s*$/u, '')
    .trim()
  if (stripped === '数量' && t !== '数量') return '数量'
  return t
}

/** 将旧版内置列显示名统一（不改 key，兼容数据） */
export function normalizeBuiltinFieldLabels(fields: FieldDef[]): FieldDef[] {
  return fields.map((f) => {
    if (f.key === 'plate') {
      const n = f.name.trim()
      if (n === '车牌号' || n === '车牌') return { ...f, name: '购买方' }
    }
    if (f.key === 'quantity') {
      const next = normalizeQuantityFieldLabel(f.name)
      if (next !== f.name.trim()) return { ...f, name: next }
    }
    return f
  })
}

/** 为旧数据补上「单价」内置列，并把数量/购买方/金额顺序后移 */
export function mergeMissingDefaultFields(fields: FieldDef[]): FieldDef[] {
  const next = normalizeBuiltinFieldLabels(fields)
  if (next.some((f) => f.key === 'unitPrice')) return next
  const unitDef = getDefaultFieldDefs().find((f) => f.key === 'unitPrice')
  if (!unitDef) return next
  const bumped = next.map((f) => {
    if (f.key === 'quantity' || f.key === 'plate' || f.key === 'amount')
      return { ...f, order: f.order + 1 }
    return f
  })
  return [...bumped, { ...unitDef, order: 1 }].sort((a, b) => a.order - b.order)
}
