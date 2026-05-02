export type FieldType = 'text' | 'number'

export interface FieldDef {
  id: string
  name: string
  type: FieldType
  /** stable keys for built-ins */
  key?: 'product' | 'quantity' | 'plate'
  order: number
}

/** 同一车牌订单下的单行商品（仅含商品、数量等子字段） */
export interface LineItemRow {
  id: string
  values: Record<string, string>
}

export interface LedgerRecord {
  id: string
  /** YYYY-MM-DD 记账日（当地日历日） */
  date: string
  createdAt: number
  /** fieldId -> value（车牌、金额等；多商品时商品/数量也可保留首行兼容旧逻辑） */
  values: Record<string, string>
  /** 同一客户一次购买多种商品 */
  lineItems?: LineItemRow[]
  /** 已核销（已收款）；缺省 false */
  settled?: boolean
}

export const DEFAULT_FIELD_KEYS = {
  product: 'field_product',
  quantity: 'field_quantity',
  plate: 'field_plate',
} as const
