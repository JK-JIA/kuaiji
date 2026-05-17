/**
 * 服务端豆包语音解析：模型与 Key 仅读 process.env，客户端无需重新打包即可随服务端升级。
 */

function sanitizeUnsignedDecimalInput(raw: string): string {
  return raw.replace(/[^\d.]/g, '').replace(/^(\d*)\.(.*)\./, '$1.$2')
}

function computedLineAmountFromUnitAndQty(
  unitPriceStr: string,
  quantityStr: string,
): string {
  const u = parseFloat(sanitizeUnsignedDecimalInput(unitPriceStr))
  const q = parseFloat(sanitizeUnsignedDecimalInput(quantityStr))
  if (!Number.isFinite(u) || !Number.isFinite(q) || u <= 0 || q <= 0) {
    return ''
  }
  const cents = Math.round(u * q * 100)
  const v = cents / 100
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

export type VoiceFieldMeta = {
  id: string
  name: string
  key?: string
}

export type VoiceProductLine = {
  product: string
  quantity: string
  unitPrice?: string
  lineAmount?: string
}

export type VoiceParseResult = {
  success: boolean
  data?: Record<string, string>
  productLines?: VoiceProductLine[]
  error?: string
}

const DOUBAO_API_KEY = process.env.DOUBAO_API_KEY?.trim() ?? ''
const DOUBAO_MODEL =
  process.env.DOUBAO_MODEL?.trim() || 'doubao-seed-1-8-251228'
const DOUBAO_ENDPOINT =
  process.env.DOUBAO_ENDPOINT?.trim() ||
  'https://ark.cn-beijing.volces.com/api/v3/responses'
const ARK_CHAT_ENDPOINT =
  'https://ark.cn-beijing.volces.com/api/v3/chat/completions'

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

const BUYER_SPEECH_ALIASES = ['对方', '客户', '买家'] as const

export function doubaoEnvReady(): boolean {
  return DOUBAO_API_KEY.length > 0
}

type ArkCallFailure = {
  ok: false
  status: number
  errorData: unknown
  errorText: string
  via: 'responses' | 'chat'
}

type ArkCallSuccess = { ok: true; data: unknown; via: 'responses' | 'chat' }

function pickArkErrorMessage(errorData: unknown, errorText: string): string {
  if (errorData && typeof errorData === 'object') {
    const root = errorData as Record<string, unknown>
    const err = root.error
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>
      const code = typeof e.code === 'string' ? e.code.trim() : ''
      const msg = typeof e.message === 'string' ? e.message.trim() : ''
      if (code && msg) return `${code}: ${msg}`
      if (msg) return msg
    }
    if (typeof root.message === 'string' && root.message.trim()) {
      return root.message.trim()
    }
  }
  const t = errorText.trim()
  return t.length > 0 && t.length < 400 ? t : ''
}

function formatDoubaoHttpError(failure: ArkCallFailure, model: string): string {
  const detail = pickArkErrorMessage(failure.errorData, failure.errorText)
  const suffix = detail ? `（${detail}）` : ''

  if (failure.status === 401) {
    return `API Key 无效${suffix}，请检查服务端 DOUBAO_API_KEY`
  }
  if (failure.status === 403) {
    return (
      `无权调用模型「${model}」${suffix}。请在火山方舟开通该模型，或将 DOUBAO_MODEL 改为已开通的 ep-xxxx / 模型 ID。`
    )
  }
  if (failure.status === 404) {
    return `模型「${model}」不可用${suffix}。请核对服务端 DOUBAO_MODEL。`
  }
  if (failure.status === 429) {
    return '请求过于频繁，请稍后再试'
  }
  return `API 错误 ${failure.status}${suffix ? `: ${suffix}` : ''}`
}

function extractResponsesApiText(result: unknown): string {
  if (!result || typeof result !== 'object') return ''
  const root = result as Record<string, unknown>
  if (typeof root.output_text === 'string' && root.output_text.trim()) {
    return root.output_text.trim()
  }
  const output = root.output
  if (!Array.isArray(output)) return ''
  const parts: string[] = []
  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    const content = (item as Record<string, unknown>).content
    if (!Array.isArray(content)) continue
    for (const c of content) {
      if (!c || typeof c !== 'object') continue
      const t = (c as Record<string, unknown>).text
      if (typeof t === 'string' && t.trim()) parts.push(t)
    }
  }
  return parts.join('')
}

function extractChatCompletionsText(result: unknown): string {
  if (!result || typeof result !== 'object') return ''
  const choice0 = (result as { choices?: unknown[] }).choices?.[0]
  if (!choice0 || typeof choice0 !== 'object') return ''
  const msg = (choice0 as { message?: unknown }).message
  if (!msg || typeof msg !== 'object') return ''
  const content = (msg as { content?: unknown }).content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (!p || typeof p !== 'object') return ''
        const t = (p as { text?: unknown }).text
        return typeof t === 'string' ? t : ''
      })
      .join('')
  }
  return ''
}

async function callArkResponses(
  prompt: string,
  model: string,
): Promise<ArkCallSuccess | ArkCallFailure> {
  const response = await fetch(DOUBAO_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DOUBAO_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: prompt }],
        },
      ],
    }),
  })
  if (!response.ok) {
    const errorText = await response.text()
    let errorData: unknown = { message: errorText }
    try {
      errorData = JSON.parse(errorText)
    } catch {
      /* keep raw */
    }
    return {
      ok: false,
      status: response.status,
      errorData,
      errorText,
      via: 'responses',
    }
  }
  return { ok: true, data: await response.json(), via: 'responses' }
}

async function callArkChat(
  prompt: string,
  model: string,
): Promise<ArkCallSuccess | ArkCallFailure> {
  const response = await fetch(ARK_CHAT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DOUBAO_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!response.ok) {
    const errorText = await response.text()
    let errorData: unknown = { message: errorText }
    try {
      errorData = JSON.parse(errorText)
    } catch {
      /* keep raw */
    }
    return {
      ok: false,
      status: response.status,
      errorData,
      errorText,
      via: 'chat',
    }
  }
  return { ok: true, data: await response.json(), via: 'chat' }
}

async function callDoubaoModel(
  prompt: string,
  model: string,
): Promise<ArkCallSuccess | ArkCallFailure> {
  const tryResponsesFirst =
    DOUBAO_ENDPOINT.includes('/responses') &&
    !DOUBAO_ENDPOINT.includes('/chat/completions')

  if (!tryResponsesFirst) {
    return callArkChat(prompt, model)
  }

  const primary = await callArkResponses(prompt, model)
  if (primary.ok) return primary

  if (primary.status === 403 || primary.status === 404) {
    console.warn(
      '[ledger-api][doubao] Responses 失败，回退 Chat:',
      primary.status,
      pickArkErrorMessage(primary.errorData, primary.errorText),
    )
    const fallback = await callArkChat(prompt, model)
    if (fallback.ok) return fallback
    return fallback
  }

  return primary
}

function normalizeBuyerFieldValue(value: string, buyerLabel: string): string {
  let v = value.trim()
  if (!v) return v
  const stripPrefix = (s: string, prefix: string) => {
    const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return s.replace(new RegExp(`^${esc}(?:[:：\\s，,、]*)`), '').trim()
  }
  v = stripPrefix(v, buyerLabel)
  for (const syn of BUYER_SPEECH_ALIASES) {
    if (syn !== buyerLabel) v = stripPrefix(v, syn)
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

function normalizeMoneyDigits(s: string): string {
  const m = s.trim().match(/(\d+(?:\.\d+)?)/)
  return m ? m[1] : s.trim()
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

function getAmountFieldId(fields: VoiceFieldMeta[]): string | undefined {
  return (
    fields.find((f) => f.key === 'amount')?.id ??
    fields.find((f) => f.name.trim() === '金额')?.id
  )
}

function supplementFromUserText(
  userText: string,
  fields: VoiceFieldMeta[],
  mapped: Record<string, string>,
  lines: VoiceProductLine[] | undefined,
): { mapped: Record<string, string>; lines: VoiceProductLine[] | undefined } {
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
      if (/^\d+(?:\.\d+)?$/.test(q) && textHasJin) q = `${q}斤`
      return { ...row, quantity: q }
    })
    if (pl[0]?.quantity) next[qtyField.id] = pl[0].quantity
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

function splitLegacyListStrings(
  productStr: string,
  qtyStr: string,
): VoiceProductLine[] {
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

function buildVoiceParsePrompt(
  text: string,
  fields: VoiceFieldMeta[],
): string {
  const fieldDescriptions = fields
    .filter(
      (f) =>
        f.key !== 'product' &&
        f.key !== 'quantity' &&
        f.key !== 'unitPrice',
    )
    .map((f) => f.name)
    .join('、')

  const amountLabel =
    fields.find((f) => f.key === 'amount')?.name?.trim() || '金额'
  const buyerLabel =
    fields.find((f) => f.key === 'plate')?.name?.trim() || '购买方'

  return `你是一个批发记账助手，从用户口语中提取结构化信息，输出严格 JSON。

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
}

function mapModelContentToResult(
  content: string,
  text: string,
  fields: VoiceFieldMeta[],
): VoiceParseResult {
  const productField = fields.find((f) => f.key === 'product')
  const quantityField = fields.find((f) => f.key === 'quantity')
  const amountLabel =
    fields.find((f) => f.key === 'amount')?.name?.trim() || '金额'
  const buyerLabel =
    fields.find((f) => f.key === 'plate')?.name?.trim() || '购买方'

  let parsed: Record<string, unknown>
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { success: false, error: '无法解析返回结果' }
    }
    parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
  } catch {
    return { success: false, error: '解析结果格式错误' }
  }

  const rawDetail =
    parsed['商品明细'] ?? parsed['商品列表'] ?? parsed['line_items']
  let productLines: VoiceProductLine[] | undefined

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
          const qtyStr = String(o['数量'] ?? o['斤'] ?? o['重量'] ?? '').trim()
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

  const mappedData: Record<string, string> = {}

  for (const field of fields) {
    if (
      field.key === 'product' ||
      field.key === 'quantity' ||
      field.key === 'unitPrice'
    ) {
      continue
    }
    if (field.key === 'plate') {
      const picked = pickPlateFromParsed(parsed, buyerLabel)
      if (picked) mappedData[field.id] = picked
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
    if (picked) mappedData[amountField.id] = picked
  }

  if (productLines && productLines.length > 0) {
    if (productField) mappedData[productField.id] = productLines[0].product
    if (quantityField) mappedData[quantityField.id] = productLines[0].quantity
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
}

/** 服务端解析入口（供 /api/voice/parse） */
export async function parseVoiceOnServer(
  text: string,
  fields: VoiceFieldMeta[],
): Promise<VoiceParseResult> {
  if (!doubaoEnvReady()) {
    return {
      success: false,
      error:
        '服务端未配置豆包：请在 ledger-api 环境变量设置 DOUBAO_API_KEY（及可选 DOUBAO_MODEL）。',
    }
  }

  const prompt = buildVoiceParsePrompt(text.trim(), fields)
  const api = await callDoubaoModel(prompt, DOUBAO_MODEL)
  if (!api.ok) {
    console.error(
      '[ledger-api][doubao] 错误:',
      api.status,
      api.via,
      api.errorData,
    )
    return {
      success: false,
      error: formatDoubaoHttpError(api, DOUBAO_MODEL),
    }
  }

  const content =
    api.via === 'responses'
      ? extractResponsesApiText(api.data) ||
        extractChatCompletionsText(api.data)
      : extractChatCompletionsText(api.data) ||
        extractResponsesApiText(api.data)

  if (!content.trim()) {
    return { success: false, error: '未获取到解析结果' }
  }

  return mapModelContentToResult(content, text, fields)
}
