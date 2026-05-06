import { useCallback, useRef, useState, useSyncExternalStore } from 'react'
import { useAuth } from '../context/AuthContext'
import type { DoubaoParseResult } from '../utils/doubaoParser'
import { isDoubaoConfigured, parseWithDoubao } from '../utils/doubaoParser'
import {
  clearAsrDiag,
  getAsrDiagSnapshot,
  subscribeAsrDiag,
} from '../utils/asrDiagLog'
import { startVolcAsrSession } from '../utils/volcAsrClient'
import type { FieldDef } from '../types'

type Props = {
  fields: FieldDef[]
  onApplyParsed: (
    data: Record<string, string>,
    productLines?: { product: string; quantity: string }[],
  ) => void
  /** 写入首行商品/数量（无豆包时） */
  onFillFirstLine: (product: string, quantity: string) => void
}

export function VoiceInputSection({
  fields,
  onApplyParsed,
  onFillFirstLine,
}: Props) {
  const { apiBase, token } = useAuth()
  const canUseVoice = Boolean(apiBase && token)

  const [recording, setRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const sessionRef = useRef<Awaited<
    ReturnType<typeof startVolcAsrSession>
  > | null>(null)

  const diagText = useSyncExternalStore(
    subscribeAsrDiag,
    getAsrDiagSnapshot,
    getAsrDiagSnapshot,
  )

  const copyDiag = useCallback(async () => {
    const t = getAsrDiagSnapshot()
    try {
      await navigator.clipboard.writeText(t)
      setHint('诊断日志已复制到剪贴板')
    } catch {
      setHint('复制失败：请长按下方日志手动全选复制')
    }
  }, [])

  const stopRecording = useCallback(() => {
    sessionRef.current?.stop()
    sessionRef.current = null
    setRecording(false)
  }, [])

  const startRecording = useCallback(async () => {
    if (!apiBase || !token) return
    clearAsrDiag()
    setHint(null)
    setTranscript('')
    setRecording(true)
    try {
      const session = await startVolcAsrSession(apiBase, token, {
        onText: (text) => setTranscript(text),
        onError: (msg) => {
          setHint(msg)
          stopRecording()
        },
      })
      sessionRef.current = session
    } catch (e) {
      setRecording(false)
      setHint(e instanceof Error ? e.message : '无法开始录音')
    }
  }, [apiBase, token, stopRecording])

  const handleParse = useCallback(async () => {
    const text = transcript.trim()
    if (!text) {
      setHint('请先完成语音识别')
      return
    }
    if (!isDoubaoConfigured()) {
      onFillFirstLine(text, '')
      setHint('已填入首行商品，其余请手改或更新带「智能填入」的安装包。')
      return
    }
    setBusy(true)
    setHint(null)
    try {
      const r: DoubaoParseResult = await parseWithDoubao(text, fields)
      if (!r.success || !r.data) {
        setHint(r.error ?? '解析失败')
        return
      }
      onApplyParsed(r.data, r.productLines)
    } finally {
      setBusy(false)
    }
  }, [transcript, fields, onApplyParsed, onFillFirstLine])

  if (!canUseVoice) {
    return (
      <div className="mb-4 rounded-2xl border border-dashed border-stone-200 bg-stone-50/80 px-3 py-3 text-left text-xs text-stone-500">
        语音输入需已配置云端地址并登录账号；服务端需设置火山语音识别环境变量（见部署说明）。
      </div>
    )
  }

  return (
    <div className="mb-4 rounded-2xl border border-stone-200 bg-stone-50/80 px-3 py-3 text-left">
      <p className="text-sm font-medium text-stone-800">语音记账</p>
      <p className="mt-0.5 text-xs text-stone-500">
        直接说车牌、商品、数量、金额等；停止录音后
        {isDoubaoConfigured()
          ? '点「智能填入表单」可自动拆到各栏。'
          : '可先「填入首行商品」，其余在下方手改。'}
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {!recording ? (
          <button
            type="button"
            onClick={() => void startRecording()}
            className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white"
          >
            开始录音
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-800"
          >
            停止
          </button>
        )}
        <button
          type="button"
          disabled={busy || !transcript.trim()}
          onClick={() => void handleParse()}
          className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-800 disabled:opacity-50"
        >
          {isDoubaoConfigured()
            ? busy
              ? '填入中…'
              : '智能填入表单'
            : '填入首行商品'}
        </button>
      </div>

      <label className="mt-2 block text-xs text-stone-600">
        识别文字
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={3}
          className="mt-1 w-full resize-y rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
          placeholder="说话内容会显示在这里，也可手动改"
        />
      </label>

      {hint && (
        <p className="mt-2 text-xs text-amber-800" role="status">
          {hint}
        </p>
      )}

      <details className="mt-3 rounded-xl border border-stone-200 bg-white px-3 py-2 text-left">
        <summary className="cursor-pointer text-xs font-medium text-stone-700">
          语音连接诊断日志（出错时展开，复制发给开发者）
        </summary>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copyDiag()}
            className="rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-medium text-white"
          >
            复制全部日志
          </button>
          <button
            type="button"
            onClick={() => {
              clearAsrDiag()
              setHint('已清空诊断日志')
            }}
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs text-stone-700"
          >
            清空
          </button>
        </div>
        <textarea
          readOnly
          value={diagText || '（点「开始录音」后此处会有日志）'}
          rows={8}
          className="mt-2 w-full resize-y font-mono text-[11px] leading-snug text-stone-800"
          spellCheck={false}
        />
      </details>
    </div>
  )
}
