/**
 * 豆包大模型智能解析
 * 官网：https://www.volcengine.com/product/doubao
 * 文档：https://www.volcengine.com/docs/82379/1494384
 * 模型：Doubao-Seed-2.0-mini (多模态模型，支持图片识别)
 */

/** 在 .env 中配置 VITE_DOUBAO_API_KEY，勿提交密钥 */
const DOUBAO_API_KEY =
  typeof import.meta.env.VITE_DOUBAO_API_KEY === 'string'
    ? import.meta.env.VITE_DOUBAO_API_KEY.trim()
    : ''

const DOUBAO_CONFIG = {
  API_KEY: DOUBAO_API_KEY || 'your_api_key_here',
  // 模型名称
  MODEL: 'doubao-seed-2-0-mini-260215',
  // API 端点 (多模态 API)
  ENDPOINT: 'https://ark.cn-beijing.volces.com/api/v3/responses',
}

/** 智能识别得到的多行商品（每行对应表单一行） */
export type DoubaoProductLine = { product: string; quantity: string }

export interface DoubaoParseResult {
  success: boolean
  data?: Record<string, string>
  /** 多商品时每行一对；单商品时可为 1 条或与 data 首行一致 */
  productLines?: DoubaoProductLine[]
  error?: string
}

/** 模型可能用同义键表示金额，统一解析出字符串 */
const AMOUNT_JSON_KEYS = [
  '金额',
  '货款',
  '收款',
  '总价',
  '合计',
  '实收',
  '价钱',
  '费用',
  '钱',
]

function pickAmountFromParsed(
  parsed: Record<string, unknown>,
  amountFieldName: string,
): string | undefined {
  const tryVal = (k: string) => {
    const v = parsed[k]
    if (v === undefined || v === null) return undefined
    const s = String(v).trim()
    return s || undefined
  }
  const primary = tryVal(amountFieldName)
  if (primary) return normalizeMoneyDigits(primary)
  for (const k of AMOUNT_JSON_KEYS) {
    const s = tryVal(k)
    if (s) return normalizeMoneyDigits(s)
  }
  return undefined
}

/** 中文金额数字转阿拉伯（仅常见简写，避免过复杂） */
function normalizeMoneyDigits(s: string): string {
  const t = s.trim()
  const m = t.match(/(\d+(?:\.\d+)?)/)
  if (m) return m[1]
  return t
}

function getAmountFieldId(
  fields: Array<{ id: string; name: string; key?: string }>,
): string | undefined {
  return (
    fields.find((f) => f.key === 'amount')?.id ??
    fields.find((f) => f.name.trim() === '金额')?.id
  )
}

/**
 * 模型漏填时，用用户原文做轻量规则补全：金额、数量单位
 */
function supplementFromUserText(
  userText: string,
  fields: Array<{ id: string; name: string; key?: string }>,
  mapped: Record<string, string>,
  lines: DoubaoProductLine[] | undefined,
): { mapped: Record<string, string>; lines: DoubaoProductLine[] | undefined } {
  const next = { ...mapped }
  let pl = lines?.map((l) => ({ ...l }))

  const amountId = getAmountFieldId(fields)
  if (amountId && !next[amountId]?.trim()) {
    const reList = [
      /(?:收了|货款|实收|一共|合计|总共|给(?:了)?|转账)[:：\s]*(\d+(?:\.\d+)?)\s*(?:元|块|块钱)?/,
      /(\d+(?:\.\d+)?)\s*(?:元|块|块钱)(?:左右)?/,
      /(?:￥|¥)\s*(\d+(?:\.\d+)?)/,
      /价钱[:：\s]*(\d+(?:\.\d+)?)/,
    ]
    for (const re of reList) {
      const m = userText.match(re)
      if (m?.[1]) {
        next[amountId] = m[1]
        break
      }
    }
  }

  const qtyField = fields.find((f) => f.key === 'quantity')
  if (qtyField && pl?.length) {
    const textHasJin = /斤/.test(userText)
    pl = pl.map((row) => {
      let q = row.quantity.trim()
      if (!q) return row
      if (/^\d+(?:\.\d+)?$/.test(q) && textHasJin) {
        q = `${q}斤`
      }
      return { ...row, quantity: q }
    })
    if (pl[0]?.quantity) {
      next[qtyField.id] = pl[0].quantity
    }
  }

  return { mapped: next, lines: pl }
}

/** 顿号/逗号拆分「红薯、白薯」与「100斤、15斤」为两行（段数一致时） */
function splitLegacyListStrings(
  productStr: string,
  qtyStr: string,
): DoubaoProductLine[] {
  const splitSeg = (s: string) =>
    s
      .split(/[、,，]/)
      .map((x) => x.trim())
      .filter(Boolean)
  const products = splitSeg(productStr)
  const qtys = splitSeg(qtyStr)
  if (products.length !== qtys.length || products.length <= 1) return []
  return products.map((product, i) => ({
    product,
    quantity: qtys[i] ?? '',
  }))
}

/**
 * 使用豆包大模型解析自然语言输入
 */
export async function parseWithDoubao(
  text: string,
  fields: Array<{ id: string; name: string; key?: string }>,
): Promise<DoubaoParseResult> {
  if (!isDoubaoConfigured()) {
    return {
      success: false,
      error: '请先配置豆包 API Key',
    }
  }

  try {
    // 构建字段说明
    const fieldDescriptions = fields
      .filter((f) => f.key !== 'product' && f.key !== 'quantity')
      .map((f) => f.name)
      .join('、')

    const productField = fields.find((f) => f.key === 'product')
    const quantityField = fields.find((f) => f.key === 'quantity')

    // 构建提示词
    const amountLabel =
      fields.find((f) => f.key === 'amount')?.name?.trim() || '金额'

    const prompt = `你是一个批发记账助手，从用户口语中提取结构化信息，输出严格 JSON。

用户原话：${text}

须提取的字段名必须与系统一致（含自定义列）：${fieldDescriptions || '车牌号等'}；其中**金额类字段名固定为「${amountLabel}」**（不要用收款、价钱等别的键名）。

【商品与数量】
- 多种商品：必须用「商品明细」数组，每项一条：{ "商品":"名称", "数量":"数字+单位" }。
- **数量一律写成数字+单位**，例如：5斤、100斤、12.5公斤、3包；禁止只写「100」不写单位（除非原文完全没有单位则用「斤」）。
- 用户说「五斤」「一百斤」分别写成「5斤」「100斤」。
- 多种商品禁止把名称堆在一个字段里用顿号拼接；每种一行。

【金额 ${amountLabel}】
- 听到钱款时必须填「${amountLabel}」，值为**阿拉伯数字**（不要中文数字），可带小数：如「两百块」「二百元」→「200」；「五十」→「50」。
- **关键词**：收了、货款、一共、合计、总共、实收、给了、转账、元、块、块钱、￥ —— 后面出现的数字即金额。
- 若只说「50」且上下文明确是钱（如收了50），也要写入「${amountLabel}」。

【车牌】完整车牌、尾号、简称均可。

【输出】只输出一个 JSON 对象，不要 markdown、不要解释。

多商品示例：
{
  "商品明细": [
    { "商品": "红薯", "数量": "100斤" },
    { "商品": "白薯", "数量": "15斤" }
  ],
  "车牌号": "京A8899",
  "${amountLabel}": "3150"
}

单商品示例：
{
  "商品明细": [ { "商品": "苹果", "数量": "5斤" } ],
  "车牌号": "川A12345",
  "${amountLabel}": "50"
}`

    console.log('调用豆包 API，模型:', DOUBAO_CONFIG.MODEL)
    
    // 调用豆包 API (多模态格式)
    const response = await fetch(DOUBAO_CONFIG.ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DOUBAO_CONFIG.API_KEY}`,
      },
      body: JSON.stringify({
        model: DOUBAO_CONFIG.MODEL,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: prompt,
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { message: errorText }
      }
      console.error('豆包 API 错误:', response.status, errorData)
      
      if (response.status === 401) {
        return { success: false, error: 'API Key 无效，请检查配置' }
      } else if (response.status === 404) {
        return { success: false, error: '推理接入点不存在或未激活，请检查配置' }
      } else if (response.status === 429) {
        return { success: false, error: '请求过于频繁，请稍后再试' }
      } else {
        return { success: false, error: `API 错误 ${response.status}: ${errorData.message || '未知错误'}` }
      }
    }

    const result = await response.json()
    console.log('豆包 API 响应:', result)
    
    // 多模态 API 的响应格式：result.output 是一个数组
    // 需要找到 type 为 'message' 的项，然后从 content 中提取文本
    let content = ''
    if (result.output && Array.isArray(result.output)) {
      // 找到 type 为 'message' 的项
      const messageOutput = result.output.find((item: any) => item.type === 'message')
      console.log('找到的 messageOutput:', messageOutput)
      
      // 从 message 的 content 数组中提取文本
      if (messageOutput && messageOutput.content && Array.isArray(messageOutput.content)) {
        console.log('content 数组:', messageOutput.content)
        messageOutput.content.forEach((c: any, index: number) => {
          console.log('content[' + index + ']:', c)
        })
        
        /** Responses API 多为 output_text；旧版可能是 text */
        const textBlock = messageOutput.content.find(
          (c: any) => c.type === 'text' || c.type === 'output_text',
        )
        console.log('找到的文本块:', textBlock)
        content =
          (typeof textBlock?.text === 'string' ? textBlock.text : '') ||
          (typeof textBlock?.textContent === 'string'
            ? textBlock.textContent
            : '') ||
          ''
      }
    }

    if (!content) {
      console.error('未找到响应内容:', result)
      return { success: false, error: '未获取到解析结果' }
    }
    
    console.log('提取的文本内容:', content)

    // 解析 JSON（整段里第一个完整的 {...} 对象）
    let parsed: Record<string, unknown>
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        return { success: false, error: '无法解析返回结果' }
      }
      parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
    } catch (e) {
      console.error('JSON 解析失败:', content)
      return { success: false, error: '解析结果格式错误' }
    }

    const rawDetail =
      parsed['商品明细'] ?? parsed['商品列表'] ?? parsed['line_items']
    let productLines: DoubaoProductLine[] | undefined

    if (Array.isArray(rawDetail) && rawDetail.length > 0) {
      productLines = rawDetail
        .map((row: unknown) => {
          if (row && typeof row === 'object' && !Array.isArray(row)) {
            const o = row as Record<string, unknown>
            return {
              product: String(o['商品'] ?? o['名称'] ?? '').trim(),
              quantity: String(
                o['数量'] ?? o['斤'] ?? o['重量'] ?? '',
              ).trim(),
            }
          }
          return { product: '', quantity: '' }
        })
        .filter((r) => r.product)
    }

    const flatProduct = String(parsed['商品'] ?? '').trim()
    const flatQty = String(parsed['数量'] ?? '').trim()

    if (!productLines || productLines.length === 0) {
      const split = splitLegacyListStrings(flatProduct, flatQty)
      if (split.length > 0) {
        productLines = split
      } else if (flatProduct && flatQty) {
        productLines = [{ product: flatProduct, quantity: flatQty }]
      }
    }

    // 映射字段名到字段 ID（不含商品/数量多行，稍后单独写）
    const mappedData: Record<string, string> = {}

    for (const field of fields) {
      if (field.key === 'product' || field.key === 'quantity') continue
      const v = parsed[field.name]
      if (v !== undefined && v !== null && String(v).trim()) {
        mappedData[field.id] = String(v).trim()
      }
    }

    const amountField = fields.find((f) => f.key === 'amount')
    if (amountField) {
      const picked = pickAmountFromParsed(parsed, amountLabel)
      if (picked) {
        mappedData[amountField.id] = picked
      }
    }

    if (productLines && productLines.length > 0) {
      if (productField) {
        mappedData[productField.id] = productLines[0].product
      }
      if (quantityField) {
        mappedData[quantityField.id] = productLines[0].quantity
      }
    }

    const supplemented = supplementFromUserText(
      text,
      fields,
      mappedData,
      productLines,
    )

    return {
      success: true,
      data: supplemented.mapped,
      productLines: supplemented.lines,
    }
  } catch (error: any) {
    console.error('豆包解析错误:', error)
    return {
      success: false,
      error: error.message || '网络错误',
    }
  }
}

/**
 * 检查是否配置了豆包 API Key
 */
export function isDoubaoConfigured(): boolean {
  return (
    DOUBAO_CONFIG.API_KEY !== 'your_api_key_here' &&
    DOUBAO_CONFIG.API_KEY.length > 0
  )
}

