import type { FieldDef } from '../types'
import { DEFAULT_FIELD_KEYS } from '../types'

/** 与本地 Dexie 默认一致；新账号云端空库时用于种子数据 */
export function getDefaultFieldDefs(): FieldDef[] {
  return [
    {
      id: DEFAULT_FIELD_KEYS.product,
      name: '商品',
      type: 'text',
      key: 'product',
      order: 0,
    },
    {
      id: DEFAULT_FIELD_KEYS.quantity,
      name: '数量（斤）',
      type: 'number',
      key: 'quantity',
      order: 1,
    },
    {
      id: DEFAULT_FIELD_KEYS.plate,
      name: '车牌号',
      type: 'text',
      key: 'plate',
      order: 2,
    },
    {
      id: DEFAULT_FIELD_KEYS.amount,
      name: '金额',
      type: 'number',
      key: 'amount',
      order: 3,
    },
  ]
}
