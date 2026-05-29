import { useCallback, useEffect, useState } from 'react'
import { getApiBase } from '../../api/ledgerClient'
import { SETTINGS_CARD_CLASS } from './SettingsSection'
import {
  SETTINGS_SHELL_BG,
  SettingsPanelBody,
  SettingsSubHeader,
} from './settingsShell'

type VoiceParseHealth = {
  doubaoEnvReady?: boolean
  voiceParseModelReady?: boolean
  voiceParseModel?: string
}

type Props = {
  onBack: () => void
}

export function VoiceParseSettingsScreen({ onBack }: Props) {
  const [health, setHealth] = useState<VoiceParseHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadHealth = useCallback(async () => {
    const base = getApiBase()?.replace(/\/$/, '')
    if (!base) {
      setHealth(null)
      setError('未配置云端 API')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`${base}/api/asr/health`, { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = (await r.json()) as VoiceParseHealth
      setHealth(j)
    } catch (e) {
      setHealth(null)
      setError(e instanceof Error ? e.message : '无法读取服务端配置')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadHealth()
  }, [loadHealth])

  const model = health?.voiceParseModel?.trim() ?? ''

  return (
    <div className={SETTINGS_SHELL_BG}>
      <SettingsSubHeader title="智能解析" onBack={onBack} />
      <SettingsPanelBody>
        <p className="px-1 text-[12px] leading-relaxed text-stone-500">
          语音转文字之后，由豆包从口语中提取购买方、商品、数量、金额等。模型在服务端配置，改后需重启
          API。
        </p>

        <div className={`mt-4 ${SETTINGS_CARD_CLASS} px-4 py-4`}>
          <p className="text-[11px] font-medium text-kj-secondary">
            当前使用模型
          </p>
          {loading ? (
            <p className="mt-2 text-sm text-kj-muted">读取中…</p>
          ) : error ? (
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
              {error}
            </p>
          ) : model ? (
            <p className="mt-2 break-all font-mono text-[15px] font-semibold leading-snug text-kj-primary">
              {model}
            </p>
          ) : (
            <p className="mt-2 text-sm text-kj-muted">未配置 DOUBAO_MODEL</p>
          )}

          {!loading && !error && health?.doubaoEnvReady && !model ? (
            <p className="mt-2 text-[11px] text-amber-800 dark:text-amber-300">
              请在服务端设置火山方舟推理接入点 ID（ep- 开头），并重启 ledger-api
            </p>
          ) : null}
          {!loading && !error && health?.doubaoEnvReady === false ? (
            <p className="mt-2 text-[11px] text-amber-800 dark:text-amber-300">
              未配置 DOUBAO_API_KEY，智能解析不可用
            </p>
          ) : null}
          {!loading && !error && health?.doubaoEnvReady && model ? (
            <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-400">
              与服务器环境变量 DOUBAO_MODEL 一致；不一致请重启 ledger-api
            </p>
          ) : null}
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={() => void loadHealth()}
          className="mt-3 px-1 text-[12px] font-medium text-[#1a7f4c] hover:underline disabled:opacity-50"
        >
          刷新
        </button>
      </SettingsPanelBody>
    </div>
  )
}

/** 设置首页副标题：当前智能解析模型 */
export async function fetchVoiceParseModelSubtitle(): Promise<string> {
  const base = getApiBase()?.replace(/\/$/, '')
  if (!base) return '需配置云端 API'
  try {
    const r = await fetch(`${base}/api/asr/health`, { cache: 'no-store' })
    if (!r.ok) return '无法读取服务端'
    const j = (await r.json()) as VoiceParseHealth
    const m = j.voiceParseModel?.trim()
    if (!m) return j.doubaoEnvReady ? '未配置模型' : '未配置豆包'
    return m.length > 28 ? `${m.slice(0, 26)}…` : m
  } catch {
    return '无法连接服务端'
  }
}
