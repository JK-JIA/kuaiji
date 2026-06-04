import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useLedger } from '../context/LedgerContext'
import {
  isAppTutorialSeen,
  markAppTutorialSeen,
  registerAppTutorialOpenHandler,
} from '../utils/appTutorial'
import { AppTutorialModal } from './AppTutorialModal'

/** 首次进入首页展示教程；可通过 openAppTutorial() 再次打开 */
export function AppTutorialGate() {
  const { pathname } = useLocation()
  const { ready } = useLedger()
  const [open, setOpen] = useState(false)
  const [autoShown, setAutoShown] = useState(false)

  const onHome = pathname === '/'

  const close = useCallback(() => setOpen(false), [])

  const finish = useCallback(() => {
    markAppTutorialSeen()
  }, [])

  useEffect(() => {
    registerAppTutorialOpenHandler(() => setOpen(true))
    return () => registerAppTutorialOpenHandler(null)
  }, [])

  useEffect(() => {
    if (!onHome || !ready || autoShown || isAppTutorialSeen()) return
    const t = window.setTimeout(() => {
      setAutoShown(true)
      setOpen(true)
    }, 500)
    return () => window.clearTimeout(t)
  }, [onHome, ready, autoShown])

  if (!onHome) return null

  return (
    <AppTutorialModal open={open} onClose={close} onFinished={finish} />
  )
}
