/**
 * 豆包大模型智能解析
 * 官网：https://www.volcengine.com/product/doubao
 * 对话(Chat) API（本文件调用 chat/completions）：https://www.volcengine.com/docs/82379/1298454
 * 模型：VITE_DOUBAO_MODEL 与 Chat 请求体 model 一致——可为接入点 ID（ep-xxxx），
 * 或文档/控制台给出的模型端点 ID（如 doubao-1-5-lite-32k-250115），须与 curl 示例逐字相同
 */

import { computedLineAmountFromUnitAndQty } from './recordHelpers'

/** 在 .env 中配置 VITE_DOUBAO_API_KEY，勿提交密钥 */
const DOUBAO_API_KEY =
  typeof import.meta.env.VITE_DOUBAO_API_KEY === 'string'
    ? import.meta.env.VITE_DOUBAO_API_KEY.trim()
    : ''

/**
 * 方舟 Chat Completions 的 `model`：控制台「推理接入点」的 ep-xxxx，
 * 或官方给出的模型端点字符串（见文档 curl 的 model 字段）；勿手写错字符（如 1.5 与 1-5）。
 */
const DOUBAO_MODEL =
  typeof import.meta.env.VITE_DOUBAO_MODEL === 'string'
    ? import.meta.env.VITE_DOUBAO_MODEL.trim()
    : ''

const DOUBAO_CONFIG = {
  API_KEY: DOUBAO_API_KEY || 'your_api_key_here',
  MODEL: DOUBAO_MODEL,
  ENDPOINT: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
}

/** 智能识别得到的多行商品（每行对应表单一行） */
export type DoubaoProductLine = {
  product: string
  quantity: string
  /** 单价（元/斤），可选；与数量齐全时可由系统算行金额 */
  unitPrice?: string
  /** 该行金额（元），可选 */
  lineAmount?: string
}

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

/** 口语里常指购买方（与列名同义，用于解析 JSON 键） */
const BUYER_SPEECH_ALIASES = ['对方', '客户', '买家'] as const

/**
 * 购买方字段值：去掉用户复述的列名前缀（如「购买方4排三号」→「4排三号」），
 * 并去掉「对方：」等同义引导语。
 */
function normalizeBuyerFieldValue(
  value: string,
  buyerLabel: string,
): string {
  let v = value.trim()
  if (!v) return v
  const stripPrefix = (s: string, prefix: string) => {
    const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return s.replace(new RegExp(`^${esc}(?:[:：\\s，,、]*)`), '').trim()
  }
  v = stripPrefix(v, buyerLabel)
  for (const syn of BUYER_SPEECH_ALIASES) {
    if (syn !== buyerLabel) {
      v = stripPrefix(v, syn)
    }
  }
  return v
}

function pickPlateFromParsed(
  parsed: Record<string, unknown>,
  buyerLabel: string,
): string | undefined {
  const tryKey = (k: string) => {
    const raw = parsed[k]
    if (raw === undefined || raw === null) return undefined
    const s = String(raw).trim()
    return s || undefined
  }
  const primary = tryKey(buyerLabel)
  if (primary) return normalizeBuyerFieldValue(primary, buyerLabel)
  for (const syn of BUYER_SPEECH_ALIASES) {
    const s = tryKey(syn)
    if (s) return normalizeBuyerFieldValue(s, buyerLabel)
  }
  return undefined
}

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

  if (pl?.length) {
    pl = pl.map((row) => {
      const comp = computedLineAmountFromUnitAndQty(
        row.unitPrice ?? '',
        row.quantity ?? '',
      )
      if (comp && !(row.lineAmount ?? '').trim()) {
        return { ...row, lineAmount: comp }
      }
      return row
    })
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
      error: '请先配置豆包 API Key：在 .env 中设置 VITE_DOUBAO_API_KEY，改后需重启 dev 或重新 build。',
    }
  }

  if (!DOUBAO_CONFIG.MODEL) {
    return {
      success: false,
      error:
        '已配置 API Key，但未设置模型标识：请在 .env 中增加 VITE_DOUBAO_MODEL，与方舟 Chat 接口里 model 一致（可为 ep-xxxx 接入点 ID，或文档 curl 中的模型端点 ID，须逐字一致），重启 dev 或重新 build。',
    }
  }

  try {
    // 构建字段说明
    const fieldDescriptions = fields
      .filter(
        (f) =>
          f.key !== 'product' &&
          f.key !== 'quantity' &&
          f.key !== 'unitPrice',
      )
      .map((f) => f.name)
      .join('、')

    const productField = fields.find((f) => f.key === 'product')
    const quantityField = fields.find((f) => f.key === 'quantity')

    // 构建提示词
    const amountLabel =
      fields.find((f) => f.key === 'amount')?.name?.trim() || '金额'
    const buyerLabel =
      fields.find((f) => f.key === 'plate')?.name?.trim() || '购买方'

    const prompt = `你是一个批发记账助手，从用户口语中提取结构化信息，输出严格 JSON。

用户原话：${text}

须提取的字段名必须与系统一致（含自定义列）：${fieldDescriptions || `${buyerLabel}等`}；其中**金额类字段名固定为「${amountLabel}」**（不要用收款、价钱等别的键名）。

【商品与数量】
- 多种商品：必须用「商品明细」数组，每项一条：{ "商品":"名称", "数量":"数字+单位（如斤）", "单价":"数字（元/斤，可选）" }；若用户说了**该行货款**或**小计**，再加 "金额":"数字"（该行小计，元）。若同时有「单价」和可换算的斤数，可省略 "金额"。
- **数量一律写成数字+单位**，例如：5斤、100斤、12.5公斤、3包；禁止只写「100」不写单位（除非原文完全没有单位则用「斤」）。
- **单价**：用户说「每斤3块」「单价2.5」等，写成阿拉伯数字的 "单价" 字段（元/斤）。
- 用户说「五斤」「一百斤」分别写成「5斤」「100斤」。
- 多种商品禁止把名称堆在一个字段里用顿号拼接；每种一行。

【金额 ${amountLabel}】
- 听到钱款时必须填「${amountLabel}」，值为**阿拉伯数字**（不要中文数字），可带小数：如「两百块」「二百元」→「200」；「五十」→「50」。
- **关键词**：收了、货款、一共、合计、总共、实收、给了、转账、元、块、块钱、￥ —— 后面出现的数字即金额。
- 若只说「50」且上下文明确是钱（如收了50），也要写入「${amountLabel}」。

【${buyerLabel}】可填车牌号、摊位号（如「4排三号」）、姓名、手机尾号等购买方标识。
- 用户说「对方」「客户」「买家」时与「${buyerLabel}」同义，一律用 JSON 键「${buyerLabel}」输出。
- **值只写标识本身**，不要把列名复述进值里：如用户说「${buyerLabel}4排三号」「对方4排三号」「买家 京A123」，值应分别为「4排三号」「4排三号」「京A123」，禁止写成「${buyerLabel}4排三号」。

【输出】只输出一个 JSON 对象，不要 markdown、不要解释。

多商品示例：
{
  "商品明细": [
    { "商品": "红薯", "数量": "30斤", "单价": "2", "金额": "60" },
    { "商品": "白薯", "数量": "15斤", "单价": "2" }
  ],
  "${buyerLabel}": "京A8899",
  "${amountLabel}": "90"
}

单商品示例：
{
  "商品明细": [ { "商品": "苹果", "数量": "5斤", "单价": "6" } ],
  "${buyerLabel}": "川A12345",
  "${amountLabel}": "30"
}`

    console.log('调用豆包 API，模型:', DOUBAO_CONFIG.MODEL)

    // Chat Completions：messages + 纯文本 content（与 /responses 的 input 多模态块不同）
    const response = await fetch(DOUBAO_CONFIG.ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DOUBAO_CONFIG.API_KEY}`,
      },
      body: JSON.stringify({
        model: DOUBAO_CONFIG.MODEL,
        messages: [{ role: 'user', content: prompt }],
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
        const detail =
          (typeof errorData?.message === 'string' && errorData.message) ||
          (typeof errorData?.error?.message === 'string' &&
            errorData.error.message) ||
          ''
        const suffix = detail ? `（${detail}）` : ''
        return {
          success: false,
          error: `模型或接入点不可用${suffix}。请核对 VITE_DOUBAO_MODEL 是否与控制台/文档 curl 中的 model 完全一致（ep-xxxx 或如 doubao-1-5-lite-32k-250115），接入点已开通，且地域与 URL 一致（本请求为 cn-beijing）。`,
        }
      } else if (response.status === 429) {
        return { success: false, error: '请求过于频繁，请稍后再试' }
      } else {
        return { success: false, error: `API 错误 ${response.status}: ${errorData.message || '未知错误'}` }
      }
    }

    const result = await response.json()
    console.log('豆包 API 响应:', result)

    // Chat Completions：choices[0].message.content 为助手回复文本
    let content = ''
    const choice0 = result?.choices?.[0]
    const msg = choice0?.message
    if (typeof msg?.content === 'string') {
      content = msg.content
    } else if (Array.isArray(msg?.content)) {
      const parts = msg.content as Array<{ type?: string; text?: string }>
      content = parts
        .filter((p) => p && (p.type === 'text' || p.text != null))
        .map((p) => (typeof p.text === 'string' ? p.text : ''))
        .join('')
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
            const rowAmt =
              o['金额'] ?? o['小计'] ?? o['行金额'] ?? o['价款'] ?? o['价钱']
            const lineAmountRaw =
              rowAmt !== undefined && rowAmt !== null
                ? String(rowAmt).trim()
                : ''
            const upRaw =
              o['单价'] ?? o['单价每斤'] ?? o['每斤'] ?? o['元每斤']
            const unitPriceRaw =
              upRaw !== undefined && upRaw !== null
                ? normalizeMoneyDigits(String(upRaw).trim())
                : ''
            const qtyStr = String(
              o['数量'] ?? o['斤'] ?? o['重量'] ?? '',
            ).trim()
            const computed = unitPriceRaw
              ? computedLineAmountFromUnitAndQty(unitPriceRaw, qtyStr)
              : ''
            const lineAmountFinal =
              lineAmountRaw && normalizeMoneyDigits(lineAmountRaw)
                ? normalizeMoneyDigits(lineAmountRaw)
                : computed || undefined
            return {
              product: String(o['商品'] ?? o['名称'] ?? '').trim(),
              quantity: qtyStr,
              unitPrice: unitPriceRaw || undefined,
              lineAmount: lineAmountFinal,
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
      if (
        field.key === 'product' ||
        field.key === 'quantity' ||
        field.key === 'unitPrice'
      )
        continue
      if (field.key === 'plate') {
        const picked = pickPlateFromParsed(parsed, buyerLabel)
        if (picked) {
          mappedData[field.id] = picked
        }
        continue
      }
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
 * 是否启用「智能填入」：仅看 API Key（接入点 ID 单独校验，缺失时在请求前提示，避免只配了 Key 却显示「填入首行」）
 */
export function isDoubaoConfigured(): boolean {
  return (
    DOUBAO_CONFIG.API_KEY !== 'your_api_key_here' &&
    DOUBAO_CONFIG.API_KEY.length > 0
  )
}

