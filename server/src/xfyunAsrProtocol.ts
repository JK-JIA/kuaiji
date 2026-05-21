import { createHmac } from 'crypto'

/**
 * 讯飞方言识别大模型（spark_slm_iat）WebSocket 协议封装。
 * 文档：https://www.xfyun.cn/doc/spark/spark_slm_iat.html
 *
 * 鉴权（与讯飞星火/合成等大模型一致）：
 *   1) signature_origin = "host: <host>\ndate: <RFC1123 GMT>\nGET <path> HTTP/1.1"
 *   2) signature = base64(hmac-sha256(api_secret, signature_origin))
 *   3) authorization_origin = api_key="<APIKey>", algorithm="hmac-sha256",
 *        headers="host date request-line", signature="<signature>"
 *   4) authorization = base64(authorization_origin)
 *   5) URL: wss://<host><path>?authorization=...&date=...&host=...
 */

export type XfyunCredentials = {
  appId: string
  apiKey: string
  apiSecret: string
  /** 形如 wss://iat.cn-huabei-1.xf-yun.com/v1 */
  wsUrl: string
}

function rfc1123GmtNow(): string {
  return new Date().toUTCString()
}

export function buildXfyunAuthedUrl(credentials: XfyunCredentials): string {
  const { apiKey, apiSecret, wsUrl } = credentials
  const u = new URL(wsUrl)
  if (u.protocol !== 'wss:' && u.protocol !== 'ws:') {
    throw new Error('XFYUN_ASR_WS_URL 协议必须是 wss:// 或 ws://')
  }
  const host = u.host
  const path = u.pathname || '/v1'
  const date = rfc1123GmtNow()

  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`
  const signature = createHmac('sha256', apiSecret)
    .update(signatureOrigin)
    .digest('base64')

  const authorizationOrigin =
    `api_key="${apiKey}", algorithm="hmac-sha256", ` +
    `headers="host date request-line", signature="${signature}"`
  const authorization = Buffer.from(authorizationOrigin, 'utf8').toString(
    'base64',
  )

  const params = new URLSearchParams({ authorization, date, host })
  return `${wsUrl}${wsUrl.includes('?') ? '&' : '?'}${params.toString()}`
}

export type XfyunAudioStatus = 0 | 1 | 2 // 0 首帧, 1 中间, 2 最后

export type XfyunFirstFrameOptions = {
  appId: string
  /** 默认 mandarin（普通话），方言模型支持自动识别多方言；可指定 cantonese 等 */
  accent?: string
  /** 默认 zh_cn */
  language?: string
  /** 业务参数透传（如 vad_eos, dwa, ln 等），不会覆盖必备字段 */
  extraIatParams?: Record<string, unknown>
  /** 音频采样率（默认 16000） */
  sampleRate?: number
  /** 是否在响应中包含动态修正：parameter.iat.dwa = 'wpgs' */
  enableDynamicCorrection?: boolean
  /** PCM 音频字节，若 ≤ 一帧大小，可在首帧直接携带；否则建议 0 字节 + 后续中间帧 */
  audioPcm?: Buffer
  /** 当前帧 status：通常首帧为 0，但若一次性发送结束包可传 2 */
  status?: XfyunAudioStatus
}

export function buildXfyunFirstFrame(opts: XfyunFirstFrameOptions): string {
  const audio = opts.audioPcm ?? Buffer.alloc(0)
  const status: XfyunAudioStatus = opts.status ?? 0

  const iat: Record<string, unknown> = {
    domain: 'slm',
    language: opts.language ?? 'zh_cn',
    /** 方言大模型：mulacc = 202 种方言免切换 */
    accent: opts.accent ?? 'mulacc',
    eos: 1800,
    ptt: 1,
    nunum: 1,
    /** 1=不筛选中英文 2=仅中文 3=仅英文（文档取值 1|2|3，不可为 0） */
    ltc: 1,
    vinfo: 1,
  }
  if (opts.enableDynamicCorrection !== false) iat.dwa = 'wpgs'
  if (opts.extraIatParams) {
    for (const [k, v] of Object.entries(opts.extraIatParams)) {
      // 覆盖默认值；不覆盖 domain（必填且固定为 slm）
      if (k === 'domain') continue
      iat[k] = v
    }
  }

  const frame = {
    header: {
      app_id: opts.appId,
      status,
    },
    parameter: {
      iat: {
        ...iat,
        result: {
          encoding: 'utf8',
          compress: 'raw',
          format: 'json',
        },
      },
    },
    payload: {
      audio: {
        encoding: 'raw',
        sample_rate: opts.sampleRate ?? 16000,
        channels: 1,
        bit_depth: 16,
        seq: 0,
        status,
        audio: audio.toString('base64'),
      },
    },
  }
  return JSON.stringify(frame)
}

export type XfyunContinueFrameOptions = {
  appId: string
  audioPcm: Buffer
  seq: number
  status: XfyunAudioStatus
  sampleRate?: number
}

export function buildXfyunContinueFrame(
  opts: XfyunContinueFrameOptions,
): string {
  const frame = {
    header: { app_id: opts.appId, status: opts.status },
    payload: {
      audio: {
        encoding: 'raw',
        sample_rate: opts.sampleRate ?? 16000,
        channels: 1,
        bit_depth: 16,
        seq: opts.seq,
        status: opts.status,
        audio: opts.audioPcm.toString('base64'),
      },
    },
  }
  return JSON.stringify(frame)
}

export type XfyunServerEvent =
  | { kind: 'partial'; text: string; isFinalSentence: boolean }
  | { kind: 'completed'; text: string }
  | { kind: 'error'; code: number; message: string; sid?: string }
  | { kind: 'noop' }

type XfyunWsItem = {
  cw?: Array<{ w?: string }>
}

type XfyunResultBlock = {
  ws?: XfyunWsItem[]
  /** 'apd' 追加, 'rpl' 替换；replace 时段，需用 rg 中索引覆盖之前段 */
  pgs?: 'apd' | 'rpl'
  rg?: [number, number]
  ls?: boolean // last segment
}

type XfyunResponse = {
  header?: { code?: number; message?: string; status?: number; sid?: string }
  payload?: {
    result?: {
      text?: string // base64(JSON of XfyunResultBlock)
      encoding?: string
      compress?: string
      format?: string
      seq?: number
      status?: number
    }
  }
}

export type XfyunResultAccumulator = {
  /** 已确认的句段（按段索引顺序拼接） */
  segments: Map<number, string>
  /** 增量到来的最后一个段索引（用于 rpl） */
  lastSegmentIndex: number
}

export function createXfyunAccumulator(): XfyunResultAccumulator {
  return { segments: new Map(), lastSegmentIndex: -1 }
}

function decodeWsToText(ws: XfyunWsItem[] | undefined): string {
  if (!Array.isArray(ws)) return ''
  let s = ''
  for (const item of ws) {
    const cw = item?.cw
    if (!Array.isArray(cw)) continue
    for (const w of cw) {
      if (typeof w?.w === 'string') s += w.w
    }
  }
  return s
}

/**
 * 解析讯飞响应。处理动态修正（pgs=apd/rpl, rg 段范围）。
 * 返回当前完整识别文本（结合累计器）。
 */
export function parseXfyunMessage(
  raw: string,
  acc: XfyunResultAccumulator,
): XfyunServerEvent {
  let json: XfyunResponse
  try {
    json = JSON.parse(raw)
  } catch {
    return { kind: 'noop' }
  }

  const code = json.header?.code ?? 0
  if (code !== 0) {
    return {
      kind: 'error',
      code,
      message: json.header?.message ?? `讯飞错误码 ${code}`,
      sid: json.header?.sid,
    }
  }

  const resultText = json.payload?.result?.text
  let block: XfyunResultBlock | undefined
  if (typeof resultText === 'string' && resultText.length > 0) {
    try {
      const decoded = Buffer.from(resultText, 'base64').toString('utf8')
      block = JSON.parse(decoded) as XfyunResultBlock
    } catch {
      block = undefined
    }
  }

  const segText = decodeWsToText(block?.ws)
  const headerStatus = json.header?.status ?? 0

  if (block) {
    const pgs = block.pgs
    const rg = block.rg
    if (pgs === 'rpl' && Array.isArray(rg) && rg.length === 2) {
      const [from, to] = rg
      for (let i = from; i <= to; i++) acc.segments.delete(i)
    }
    const idx = acc.lastSegmentIndex + 1
    acc.segments.set(idx, segText)
    acc.lastSegmentIndex = idx
  }

  const fullText = collectFullText(acc)
  if (headerStatus === 2) {
    return { kind: 'completed', text: fullText }
  }
  return { kind: 'partial', text: fullText, isFinalSentence: Boolean(block?.ls) }
}

function collectFullText(acc: XfyunResultAccumulator): string {
  const keys = [...acc.segments.keys()].sort((a, b) => a - b)
  let s = ''
  for (const k of keys) s += acc.segments.get(k) ?? ''
  return s
}

export function readXfyunCredentialsFromEnv(): XfyunCredentials | null {
  const appId = process.env.XFYUN_ASR_APP_ID?.trim()
  const apiKey = process.env.XFYUN_ASR_API_KEY?.trim()
  const apiSecret = process.env.XFYUN_ASR_API_SECRET?.trim()
  const wsUrl =
    process.env.XFYUN_ASR_WS_URL?.trim() ||
    'wss://iat.cn-huabei-1.xf-yun.com/v1'
  if (!appId || !apiKey || !apiSecret) return null
  return { appId, apiKey, apiSecret, wsUrl }
}
