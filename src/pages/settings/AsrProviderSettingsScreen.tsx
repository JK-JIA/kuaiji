import { useCallback, useEffect, useState } from 'react'
import { getApiBase } from '../../api/ledgerClient'
import {
  ASR_PROVIDER_OPTIONS,
  asrProviderLabel,
  persistAsrProvider,
  readAsrProvider,
  type AsrProviderId,
} from '../../utils/asrProvider'
import { SETTINGS_CARD_CLASS } from './SettingsSection'
import {
  SETTINGS_SHELL_BG,
  SettingsPanelBody,
  SettingsSubHeader,
} from './settingsShell'

type AsrHealth = {
  volcAsrEnvReady?: boolean
  xfyunAsrEnvReady?: boolean
}

type Props = {
  onBack: () => void
}

export function AsrProviderSettingsScreen({ onBack }: Props) {
  const [provider, setProvider] = useState<AsrProviderId>(() => readAsrProvider())
  const [health, setHealth] = useState<AsrHealth | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)

  const loadHealth = useCallback(async () => {
    const base = getApiBase()?.replace(/\/$/, '')
    if (!base) {
      setHealth(null)
      setHealthError('未配置云端 API，无法检测服务端引擎')
      return
    }
    setHealthError(null)
    try {
      const r = await fetch(`${base}/api/asr/health`, { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = (await r.json()) as AsrHealth
      setHealth(j)
    } catch (e) {
      setHealth(null)
      setHealthError(
        e instanceof Error ? e.message : '无法连接语音识别服务',
      )
    }
  }, [])

  useEffect(() => {
    void loadHealth()
  }, [loadHealth])

  const select = (id: AsrProviderId) => {
    setProvider(id)
    persistAsrProvider(id)
  }

  const readyFor = (id: AsrProviderId): boolean | null => {
    if (!health) return null
    return id === 'volc'
      ? Boolean(health.volcAsrEnvReady)
      : Boolean(health.xfyunAsrEnvReady)
  }

  return (
    <div className={SETTINGS_SHELL_BG}>
      <SettingsSubHeader title="语音识别引擎" onBack={onBack} />
      <SettingsPanelBody>
        <p className="px-1 text-[12px] leading-relaxed text-stone-500">
          长按首页麦克风或「记一笔」内语音按钮时使用所选引擎。商品、数量等智能解析见「设置 →
          智能解析」。
        </p>

        <div className={`mt-4 ${SETTINGS_CARD_CLASS}`}>
          <ul className="divide-y divide-kj-border">
            {ASR_PROVIDER_OPTIONS.map((opt) => {
              const selected = provider === opt.id
              const ready = readyFor(opt.id)
              return (
                <li key={opt.id}>
                  <button
                    type="button"
                    onClick={() => select(opt.id)}
                    className="flex w-full items-start gap-3 px-1 py-3.5 text-left transition-colors hover:bg-kj-hover/60"
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        selected
                          ? 'border-emerald-500 bg-emerald-500'
                          : 'border-stone-300 bg-kj-surface'
                      }`}
                      aria-hidden
                    >
                      {selected ? (
                        <span className="h-2 w-2 rounded-full bg-white" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium text-kj-primary">
                        {opt.label}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-kj-secondary">
                        {opt.description}
                      </span>
                      {ready === true ? (
                        <span className="mt-1 inline-block text-[11px] text-emerald-700 dark:text-emerald-400">
                          服务端已配置
                        </span>
                      ) : ready === false ? (
                        <span className="mt-1 inline-block text-[11px] text-amber-800 dark:text-amber-300">
                          服务端未配置，切换后可能无法识别
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <p className="mt-3 px-1 text-[12px] text-kj-muted">
          当前选择：
          <span className="font-medium text-kj-primary">
            {asrProviderLabel(provider)}
          </span>
        </p>

        {healthError ? (
          <p className="mt-2 px-1 text-[11px] text-amber-800 dark:text-amber-300">
            {healthError}
          </p>
        ) : null}

        <p className="mt-4 px-1 text-[11px] leading-relaxed text-kj-muted">
          讯飞需在服务器环境变量中配置 XFYUN_ASR_APP_ID、XFYUN_ASR_API_KEY、XFYUN_ASR_API_SECRET；豆包需配置 VOLC_ASR_*。详见 server/.env.example。
        </p>
      </SettingsPanelBody>
    </div>
  )
}
