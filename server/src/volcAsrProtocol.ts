import zlib from 'zlib'
import { mergeVolcAsrHotwords } from './asrHotwords.js'

/** 火山大模型流式 ASR 二进制协议（见文档 6561/1354869） */

const PROTO_VER1_HEADER_UNITS = 0x11 // version 1, header = 4 bytes

export function buildFullClientRequest(payload: Record<string, unknown>): Buffer {
  const jsonBuf = Buffer.from(JSON.stringify(payload), 'utf8')
  const gz = zlib.gzipSync(jsonBuf)
  const header = Buffer.alloc(4)
  header[0] = PROTO_VER1_HEADER_UNITS
  header[1] = (0x01 << 4) | 0x00 // full client request, flags 0
  header[2] = (0x01 << 4) | 0x01 // JSON + gzip
  header[3] = 0x00
  const size = Buffer.alloc(4)
  size.writeUInt32BE(gz.length, 0)
  return Buffer.concat([header, size, gz])
}

let audioSeq = 0
export function resetAudioSequence(): void {
  audioSeq = 0
}

export function nextAudioSequence(): number {
  audioSeq += 1
  return audioSeq
}

/** 新版 bigasr 协议：所有音频包均用自动序列号（flags=0x00），不携带 sequence 字段 */
export function buildAudioOnlyRequest(
  pcm: Buffer,
  options: { isLast: boolean; sequence: number },
): Buffer {
  const gz = zlib.gzipSync(pcm.length ? pcm : Buffer.alloc(0))
  const header = Buffer.alloc(4)
  header[0] = PROTO_VER1_HEADER_UNITS
  if (options.isLast) {
    header[1] = (0x02 << 4) | 0x02 // audio, last packet, no sequence
  } else {
    header[1] = (0x02 << 4) | 0x00 // audio, auto-assign sequence (bigasr requirement)
  }
  header[2] = (0x00 << 4) | 0x01 // raw + gzip
  header[3] = 0x00

  const size = Buffer.alloc(4)
  size.writeUInt32BE(gz.length, 0)

  // 不附加 sequence 字段，由服务端自动分配
  return Buffer.concat([header, size, gz])
}

export type VolcAsrServerPayload =
  | { kind: 'result'; text: string; definite?: boolean; json: unknown }
  | { kind: 'error'; code: number; message: string }

export function parseVolcServerBinaryMessage(buf: Buffer): VolcAsrServerPayload | null {
  if (buf.length < 4) return null
  const headerUnits = buf[0] & 0x0f
  const headerLen = headerUnits * 4
  if (buf.length < headerLen) return null

  const msgType = (buf[1] >> 4) & 0x0f
  const flags = buf[1] & 0x0f
  const compression = buf[2] & 0x0f

  if (msgType === 0x0f) {
    if (buf.length < 12) return null
    let o = headerLen
    const code = buf.readUInt32BE(o)
    o += 4
    const msgLen = buf.readUInt32BE(o)
    o += 4
    const msg = buf.subarray(o, o + msgLen).toString('utf8')
    return { kind: 'error', code, message: msg || `错误码 ${code}` }
  }

  if (msgType !== 0x09) return null

  let offset = headerLen
  if (flags === 0x01 || flags === 0x03) {
    if (buf.length < offset + 4) return null
    offset += 4
  }

  if (buf.length < offset + 4) return null
  const payloadLen = buf.readUInt32BE(offset)
  offset += 4
  if (buf.length < offset + payloadLen) return null
  let payload = buf.subarray(offset, offset + payloadLen)
  if (compression === 0x01) {
    try {
      payload = zlib.gunzipSync(payload)
    } catch {
      return { kind: 'error', code: -1, message: '解压识别结果失败' }
    }
  }

  let json: unknown
  try {
    json = JSON.parse(payload.toString('utf8'))
  } catch {
    return { kind: 'error', code: -1, message: '识别结果 JSON 无效' }
  }

  const text = extractResultText(json)
  const definite = extractDefinite(json)
  return { kind: 'result', text, definite, json }
}

function extractResultText(json: unknown): string {
  if (!json || typeof json !== 'object') return ''
  const root = json as Record<string, unknown>
  const result = root.result
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const t = (result as { text?: unknown }).text
    if (typeof t === 'string') return t
  }
  return ''
}

function extractDefinite(json: unknown): boolean | undefined {
  if (!json || typeof json !== 'object') return undefined
  const result = (json as { result?: { utterances?: unknown } }).result
  if (!result || typeof result !== 'object') return undefined
  const utt = (result as { utterances?: unknown[] }).utterances
  if (!Array.isArray(utt) || utt.length === 0) return undefined
  const last = utt[utt.length - 1]
  if (last && typeof last === 'object' && 'definite' in last) {
    return Boolean((last as { definite?: boolean }).definite)
  }
  return undefined
}

/**
 * 构建首包 JSON：可选合并客户端热词 + 控制台词表 ID（VOLC_ASR_BOOSTING_TABLE_ID）。
 * 热词放在 request.corpus.context，序列化为 JSON 字符串（文档示例）。
 */
export function buildAsrInitPayload(clientHotwords: string[]): Record<string, unknown> {
  const merged = mergeVolcAsrHotwords(clientHotwords)
  const boostingId = process.env.VOLC_ASR_BOOSTING_TABLE_ID?.trim()

  const request: Record<string, unknown> = {
    model_name: 'bigmodel',
    enable_itn: true,
    enable_punc: true,
    result_type: 'single',
  }

  const vadRaw = process.env.VOLC_ASR_VAD_SEGMENT_DURATION_MS?.trim() ?? '5000'
  const vadMs = parseInt(vadRaw, 10)
  if (!Number.isNaN(vadMs) && vadMs >= 1000 && vadMs <= 60000) {
    request.vad_segment_duration = vadMs
  }

  const corpus: Record<string, string> = {}
  if (boostingId) corpus.boosting_table_id = boostingId
  if (merged.length) {
    corpus.context = JSON.stringify({
      hotwords: merged.map((word) => ({ word })),
    })
  }
  if (Object.keys(corpus).length) request.corpus = corpus

  return {
    user: {
      uid: 'ledger-app',
      did: 'web',
      platform: 'Web',
      sdk_version: '1',
      app_version: '1.0.5',
    },
    audio: {
      format: 'pcm',
      rate: 16000,
      bits: 16,
      channel: 1,
    },
    request,
  }
}
