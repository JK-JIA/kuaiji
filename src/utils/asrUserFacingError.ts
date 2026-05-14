const FRIENDLY = '网络暂时异常，请重试'

function shouldMapToNetworkRetry(msg: string): boolean {
  if (
    /timeout|超时|\brpc\b|big\s*asr|recv\s*err|等包|45000081|operatorwrapper|server-side\s*generic\s*error|timeout_config=/i.test(
      msg,
    )
  ) {
    return true
  }
  const t = msg.trim()
  if (!/^\s*\{/.test(t)) return false
  try {
    const o = JSON.parse(t) as { error?: unknown }
    const e = typeof o.error === 'string' ? o.error : ''
    return /timeout|超时|\brpc\b|big\s*asr|recv|asr|operatorwrapper|server-side\s*generic/i.test(
      e,
    )
  } catch {
    return false
  }
}

/** 将上游 ASR 超时/链路类错误转为对用户友好的短句，其余原文透传 */
export function formatAsrUserFacingError(raw: string | undefined | null): string {
  const m = (raw ?? '').trim()
  if (!m) return FRIENDLY
  if (shouldMapToNetworkRetry(m)) return FRIENDLY
  return m
}
