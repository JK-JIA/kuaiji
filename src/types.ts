export type FieldType = 'text' | 'number'

export interface FieldDef {
  id: string
  name: string
  type: FieldType
  /** stable keys for built-ins */
  key?: 'product' | 'unitPrice' | 'quantity' | 'plate' | 'amount'
  order: number
  /** 记账/编辑时必填；缺省 false */
  required?: boolean
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
  /** 已结清/legacy 核销（无金额场景可与核账并用）；缺省 false */
  settled?: boolean
  /** 核账累计实收（与「金额」应收对比）；仅通过「核账」维护，勿与约定价混淆 */
  receivedAmount?: number
  /**
   * 总价 / 优惠后实收价（元），与各行明细合计（应收）可不同；真实已收现金在「核账」里登记。
   */
  dealAmount?: number
}

export const DEFAULT_FIELD_KEYS = {
  product: 'field_product',
  unitPrice: 'field_unit_price',
  quantity: 'field_quantity',
  plate: 'field_plate',
  amount: 'field_amount',
} as const

/** 核账弹窗提交；无应收时 cumulativeReceived 为累计实收，markSettled 表示是否标为已结清 */
export type ReconcilePayload = {
  kind: 'amount'
  cumulativeReceived: number
  markSettled?: boolean
}
