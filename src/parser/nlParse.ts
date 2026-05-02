import type { FieldDef } from '../types'

/** 从口语里尽量抽出结构化字段（启发式，可按习惯调整） */
export function parseSpokenLedger(
  raw: string,
  fields: FieldDef[],
): Record<string, string> {
  const text = raw.trim().replace(/\s+/g, '')
  const out: Record<string, string> = {}

  const byKey = (k: FieldDef['key']) => fields.find((f) => f.key === k)
  const productField = byKey('product')
  const quantityField = byKey('quantity')
  const plateField = byKey('plate')

  let rest = text

  const platePatterns = [
    /车牌尾号([A-Za-z0-9\u4e00-\u9fff]{1,8})/,
    /尾号([A-Za-z0-9]{2,8})/,
    /车牌(?:号)?[:：]?([A-Za-z0-9\u4e00-\u9fff]{2,10})/,
  ]
  if (plateField) {
    for (const re of platePatterns) {
      const m = rest.match(re)
      if (m) {
        out[plateField.id] = m[1].trim()
        rest = rest.replace(re, '')
        break
      }
    }
  }

  /** 金额：任意自定义数字段若命名为「金额」或类型 number，也可写入 */
  const amountField = fields.find((f) => f.name === '金额' || f.name.includes('金额'))
  const yuan = rest.match(/(?:共计|合计|金额)?(\d+(?:\.\d+)?)\s*元/)
  if (amountField && yuan) {
    out[amountField.id] = yuan[1]
    rest = rest.replace(yuan[0], '')
  }

  /** 数量片段：100kg、3包、两箱 等 */
  const qtyParts: string[] = []
  const unitRe = /(\d+(?:\.\d+)?)\s*(kg|KG|千克|公斤|斤|包|个|箱|件|袋|吨|车|次|条|块|瓶|台)/g
  let um: RegExpExecArray | null
  const restForUnits = rest
  while ((um = unitRe.exec(restForUnits)) !== null) {
    qtyParts.push(`${um[1]}${um[2]}`)
  }
  for (const p of qtyParts) {
    const idx = rest.indexOf(p)
    if (idx >= 0) {
      rest = rest.slice(0, idx) + rest.slice(idx + p.length)
    }
  }
  /** 「的」连接的第二数量：红薯100kg的3包 */
  const deQty = text.match(/的\s*(\d+(?:\.\d+)?)\s*(包|个|箱|件|袋|条)/)
  if (deQty && !qtyParts.includes(`${deQty[1]}${deQty[2]}`)) {
    qtyParts.push(`${deQty[1]}${deQty[2]}`)
  }

  if (quantityField && qtyParts.length > 0) {
    out[quantityField.id] = qtyParts.join('、')
  }

  /** 商品名：去掉数量数字后的连续中文/英文前缀 */
  rest = rest.replace(/的+/g, '').replace(/^[，,。.]+/, '')
  let product = rest.replace(/\d+(?:\.\d+)?/g, '').replace(/[kgKG千克公斤斤包个箱件袋吨车辆次条块瓶台]/g, '')
  product = product.replace(/^的+/, '').replace(/^[，,。.]+/, '').trim()

  /** 若还未识别商品，取开头非数字串 */
  if (productField && !out[productField.id]) {
    const head = text.match(/^([\u4e00-\u9fffA-Za-z]+)/)
    if (head) {
      let name = head[1]
      name = name.replace(/(车牌|尾号).*$/u, '').trim()
      if (name.length >= 1) out[productField.id] = name
    } else if (product.length >= 1) {
      out[productField.id] = product.slice(0, 32)
    }
  } else if (productField && product.length >= 1 && !out[productField.id]) {
    out[productField.id] = product.slice(0, 32)
  }

  /** 缺省时把剩余没用到的片段写入备注类自定义字段 */
  const noteField = fields.find((f) => f.name === '备注')
  if (noteField && !out[noteField.id]) {
    const leftover = text
      .replace(/车牌尾号\S+/u, '')
      .replace(/\d+(?:\.\d+)?\s*元/, '')
      .trim()
    if (leftover.length > 0 && leftover !== text) {
      out[noteField.id] = leftover.slice(0, 120)
    }
  }

  return out
}

/** 根据字段定义做空值填充（表单用） */
export function emptyValues(fields: FieldDef[]): Record<string, string> {
  const o: Record<string, string> = {}
  for (const f of fields) o[f.id] = ''
  return o
}

export function mergeParsedIntoForm(
  base: Record<string, string>,
  parsed: Record<string, string>,
): Record<string, string> {
  const next = { ...base }
  for (const [k, v] of Object.entries(parsed)) {
    if (v && String(v).trim()) next[k] = String(v).trim()
  }
  return next
}
