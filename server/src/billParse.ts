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
/** 账单 OCR 类任务：关闭深度思考，直接输出 JSON */
const BILL_VISION_REASONING_EFFORT = 'minimal'
const BILL_VISION_MAX_TOKENS = 512
const BILL_VISION_TEMPERATURE = 0
const BILL_VISION_IMAGE_DETAIL = 'low'

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

  return `从批发账单图片提取 JSON，字段名须与系统一致：${fieldDescriptions || `${buyerLabel}等`}；金额键固定「${amountLabel}」。${productCatalogBlock}
规则：
- 多商品用「商品明细」数组，每项 { "商品","数量"(数字+单位如5斤), "单价"(可选), "金额"(行小计，可选) }；禁止顿号拼多个商品。
- 「N*M斤」「N×M斤」= 单价N、数量M斤；「N包M元」= 数量N包、金额M。
- ${amountLabel}：合计/实收，阿拉伯数字。
- ${buyerLabel}：车牌/摊位/姓名/尾号，只写值不写列名。
- **不要输出「记账日期」「日期」等字段**；拍照录入由系统按用户手机当天日期记账，勿读单据上的印刷/手写日期。
只输出 JSON，无 markdown。看不清的字段省略，勿编造。
示例：{"商品明细":[{"商品":"红薯","数量":"30斤","单价":"2","金额":"60"}],"${buyerLabel}":"京A8899","${amountLabel}":"60"}`
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
    return `图片识别服务认证失败${suffix}，请稍后再试`
  }
  if (status === 403) {
    return `图片识别服务暂不可用${suffix}，请稍后再试`
  }
  if (status === 404) {
    return `图片识别服务暂不可用${suffix}，请稍后再试`
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
              image_url: {
                url: imageDataUrl,
                detail: BILL_VISION_IMAGE_DETAIL,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
      max_tokens: BILL_VISION_MAX_TOKENS,
      temperature: BILL_VISION_TEMPERATURE,
      reasoning_effort: BILL_VISION_REASONING_EFFORT,
      thinking: { type: 'disabled' },
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
      error: '图片识别服务暂未开通，请稍后再试。',
    }
  }
  if (!billParseModelReady()) {
    return {
      success: false,
      error: '图片识别服务暂未开通，请稍后再试。',
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
