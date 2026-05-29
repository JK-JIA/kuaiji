import { useCallback, useEffect, useState } from 'react'

const HISTORY_KEY = 'settingsPanel'

/** 设置页内子面板与系统/浏览器返回键同步（避免直接退回首页） */
function panelFromHistoryState<T extends string>(initial: T): T {
  const st = window.history.state as Record<string, unknown> | null
  const v = st?.[HISTORY_KEY]
  return (typeof v === 'string' ? v : initial) as T
}

export function useSettingsPanelNavigation<T extends string>(initial: T) {
  const [panel, setPanel] = useState<T>(() => panelFromHistoryState(initial))

  useEffect(() => {
    const st = window.history.state as Record<string, unknown> | null
    if (st?.[HISTORY_KEY] == null) {
      window.history.replaceState({ ...st, [HISTORY_KEY]: initial }, '')
    }
  }, [initial])

  useEffect(() => {
    const onPop = () => {
      setPanel(panelFromHistoryState(initial))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [initial])

  const openPanel = useCallback((next: T) => {
    setPanel((prev) => {
      if (prev === next) return prev
      window.history.pushState({ [HISTORY_KEY]: next }, '')
      return next
    })
  }, [])

  const closeSubPanel = useCallback(() => {
    window.history.back()
  }, [])

  return { panel, openPanel, closeSubPanel }
}
