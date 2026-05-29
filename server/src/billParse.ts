/**
 * 服务端图片账单识别：火山方舟视觉模型解析手写/打印单据。
 */

import {
  doubaoEnvReady,
  mapModelContentToResult,
  type VoiceFieldMeta,
  type VoiceParseResult,
} from './voiceParse.js'

const DOUBAO_API_KEY = process.env.DOUBAO_API_KEY?.trim() ?? ''
/** 图片理解模型，默认 doubao-seed-2-0-mini-260428 */
const DOUBAO_VISION_MODEL =
  process.env.DOUBAO_VISION_MODEL?.trim() || 'doubao-seed-2-0-mini-260428'
const ARK_CHAT_ENDPOINT =
  'https://ark.cn-beijing.volces.com/api/v3/chat/completions'

const MAX_IMAGE_BASE64_LEN = 4_000_000

export function billParseModelReady(): boolean {
  return DOUBAO_VISION_MODEL.length > 0
}

export function getBillParseModelId(): string {
  return DOUBAO_VISION_MODEL
}

function normalizeProductCatalogForPrompt(productCatalog?: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of productCatalog ?? []) {
    const t = raw.normalize('NFKC').trim().slice(0, 120)
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= 120) break
  }
  return out
}

function buildImageBillParsePrompt(
  fields: VoiceFieldMeta[],
  catalogOpts?: {
    productCatalog?: string[]
    productCatalogPromptSection?: string
  },
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
  const productCatalogBlock =
    catalogOpts?.productCatalogPromptSection?.trim() ||
    (() => {
      const productCandidates = normalizeProductCatalogForPrompt(
        catalogOpts?.productCatalog,
      )
      return productCandidates.length
        ? `\n【候选商品】商品字段只能填下列规范名之一：\n${productCandidates.join('、')}\n`
        : ''
    })()

  return `你是一个批发记账助手，从用户上传的账单图片（手写或打印批发单据、小票、记账本页面）中提取结构化信息，输出严格 JSON。

须提取的字段名必须与系统一致（含自定义列）：${fieldDescriptions || `${buyerLabel}等`}；其中**金额类字段名固定为「${amountLabel}」**（不要用收款、价钱等别的键名）。${productCatalogBlock}

【商品与数量】
- 多种商品：必须用「商品明细」数组，每项一条：{ "商品":"名称", "数量":"数字+单位（如斤）", "单价":"数字（元/斤，可选）" }；若图片中有**该行货款**或**小计**，再加 "金额":"数字"（该行小计，元）。
- **数量一律写成数字+单位**，例如：5斤、100斤、12.5公斤、3包；禁止只写数字不写单位（除非图片中完全没有单位则用「斤」）。
- **每一行的单位必须与图片一致**；同一商品多行时各行单位可不同。
- **单价**：图片中「每斤3块」「单价2.5」等，写成阿拉伯数字的 "单价" 字段（元/斤）。
- **「N*M斤」或「N×M斤」**：默认 **单价×数量** —— 单价 **N**（元/斤）、数量 **M斤**。
- **「N包M元」**：表示数量 **N包**、该行金额 **M**（元）。
- 多种商品禁止把名称堆在一个字段里用顿号拼接；每种一行。

【金额 ${amountLabel}】
- 图片中的合计、实收、货款等钱款必须填「${amountLabel}」，值为**阿拉伯数字**（不要中文数字），可带小数。

【${buyerLabel}】可填车牌号、摊位号、姓名、手机尾号等购买方标识。
- 值只写标识本身，不要把列名复述进值里。

【输出】只输出一个 JSON 对象，不要 markdown、不要解释。若图片模糊或无法识别某字段，可省略该字段，不要编造。

多商品示例：
{
  "商品明细": [
    { "商品": "红薯", "数量": "30斤", "单价": "2", "金额": "60" },
    { "商品": "白薯", "数量": "15斤", "单价": "2" }
  ],
  "${buyerLabel}": "京A8899",
  "${amountLabel}": "90"
}`
}

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

function formatVisionHttpError(
  status: number,
  errorData: unknown,
  errorText: string,
  model: string,
): string {
  const detail = pickArkErrorMessage(errorData, errorText)
  const suffix = detail ? `（${detail}）` : ''

  if (status === 401) {
    return `API Key 无效${suffix}，请检查服务端 DOUBAO_API_KEY`
  }
  if (status === 403) {
    return `无权调用视觉模型「${model}」${suffix}。请在火山方舟开通该模型，或将 DOUBAO_VISION_MODEL 改为已开通的模型 ID。`
  }
  if (status === 404) {
    return `视觉模型「${model}」不可用${suffix}。请核对服务端 DOUBAO_VISION_MODEL。`
  }
  if (status === 429) {
    return '请求过于频繁，请稍后再试'
  }
  return `API 错误 ${status}${suffix ? `: ${suffix}` : ''}`
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

async function callArkVision(
  prompt: string,
  imageDataUrl: string,
  model: string,
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; status: number; errorData: unknown; errorText: string }
> {
  const response = await fetch(ARK_CHAT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DOUBAO_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: imageDataUrl },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
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
    }
  }
  return { ok: true, data: await response.json() }
}

/** 服务端图片解析入口（供 /api/bill/parse） */
export async function parseBillImageOnServer(
  imageBase64: string,
  mimeType: string,
  fields: VoiceFieldMeta[],
  catalogOpts?: {
    productCatalog?: string[]
    productCatalogPromptSection?: string
  },
): Promise<VoiceParseResult> {
  if (!doubaoEnvReady()) {
    return {
      success: false,
      error:
        '服务端未配置豆包：请在 ledger-api 环境变量设置 DOUBAO_API_KEY。',
    }
  }
  if (!billParseModelReady()) {
    return {
      success: false,
      error:
        '服务端未配置 DOUBAO_VISION_MODEL。请设置图片识别模型（如 doubao-seed-2-0-mini-260428）后重启 ledger-api。',
    }
  }

  const raw = imageBase64.trim()
  if (!raw) {
    return { success: false, error: '图片数据为空' }
  }
  if (raw.length > MAX_IMAGE_BASE64_LEN) {
    return { success: false, error: '图片过大，请压缩后重试' }
  }

  const mime = mimeType.trim() || 'image/jpeg'
  const imageDataUrl = raw.startsWith('data:')
    ? raw
    : `data:${mime};base64,${raw}`

  const prompt = buildImageBillParsePrompt(fields, catalogOpts)
  const api = await callArkVision(prompt, imageDataUrl, DOUBAO_VISION_MODEL)
  if (!api.ok) {
    console.error(
      '[ledger-api][bill/parse] 错误:',
      api.status,
      api.errorData,
    )
    return {
      success: false,
      error: formatVisionHttpError(
        api.status,
        api.errorData,
        api.errorText,
        DOUBAO_VISION_MODEL,
      ),
    }
  }

  const content = extractChatCompletionsText(api.data)
  if (!content.trim()) {
    return { success: false, error: '未获取到解析结果' }
  }

  return mapModelContentToResult(content, '', fields)
}
