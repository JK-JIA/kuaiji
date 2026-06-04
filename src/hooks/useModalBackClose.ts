import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import { useEffect, useRef } from 'react'

const HISTORY_FLAG = 'kuaijiModalBack'

type Options = {
  /** 返回 true 表示已处理（如先关闭全屏子层），不关闭主弹窗 */
  onBackPress?: () => boolean
}

/**
 * 弹窗打开时压入 history，系统返回键 / 浏览器后退与「关闭」一致。
 */
export function useModalBackClose(
  open: boolean,
  onClose: () => void,
  options?: Options,
) {
  const onCloseRef = useRef(onClose)
  const onBackPressRef = useRef(options?.onBackPress)
  onCloseRef.current = onClose
  onBackPressRef.current = options?.onBackPress

  const ownsHistoryRef = useRef(false)

  useEffect(() => {
    if (!open) {
      if (ownsHistoryRef.current) {
        ownsHistoryRef.current = false
        const st = window.history.state as Record<string, unknown> | null
        if (st?.[HISTORY_FLAG]) {
          window.history.back()
        }
      }
      return
    }

    if (!ownsHistoryRef.current) {
      const prev = window.history.state as Record<string, unknown> | null
      window.history.pushState({ ...prev, [HISTORY_FLAG]: 1 }, '')
      ownsHistoryRef.current = true
    }

    const onPop = () => {
      ownsHistoryRef.current = false
      onCloseRef.current()
    }
    window.addEventListener('popstate', onPop)

    let handle: PluginListenerHandle | undefined
    void App.addListener('backButton', () => {
      if (onBackPressRef.current?.()) return
      if (ownsHistoryRef.current) {
        window.history.back()
      }
    }).then((h) => {
      handle = h
    })

    return () => {
      window.removeEventListener('popstate', onPop)
      void handle?.remove()
      if (ownsHistoryRef.current) {
        ownsHistoryRef.current = false
        const st = window.history.state as Record<string, unknown> | null
        if (st?.[HISTORY_FLAG]) {
          window.history.back()
        }
      }
    }
  }, [open])
}
