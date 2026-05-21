/** 语音识别引擎（ASR），与智能解析（豆包 LLM）独立 */
export type AsrProviderId = 'volc' | 'xfyun'

const STORAGE_KEY = 'kuaiji_asr_provider'

export const ASR_PROVIDER_OPTIONS: ReadonlyArray<{
  id: AsrProviderId
  label: string
  description: string
}> = [
  {
    id: 'volc',
    label: '豆包（火山引擎）',
    description: '默认引擎，支持热词与自定义词表',
  },
  {
    id: 'xfyun',
    label: '讯飞方言大模型',
    description: '202 种方言免切换，适合方言口语记账',
  },
]

export function asrProviderLabel(id: AsrProviderId): string {
  return ASR_PROVIDER_OPTIONS.find((o) => o.id === id)?.label ?? id
}

export function readAsrProvider(): AsrProviderId {
  try {
    const v = localStorage.getItem(STORAGE_KEY)?.trim()
    if (v === 'xfyun' || v === 'volc') return v
  } catch {
    /* ignore */
  }
  return 'volc'
}

export function persistAsrProvider(id: AsrProviderId): void {
  localStorage.setItem(STORAGE_KEY, id)
}
