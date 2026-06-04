/** 智能识别得到的多行商品（每行对应表单一行） */
export type DoubaoProductLine = {
  product: string
  quantity: string
  unitPrice?: string
  lineAmount?: string
}

export type DoubaoParseResult = {
  success: boolean
  data?: Record<string, string>
  productLines?: DoubaoProductLine[]
  /** 记账日期 yyyy-MM-dd */
  recordDate?: string
  error?: string
}
