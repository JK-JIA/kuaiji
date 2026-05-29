import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const DELETE_STRIP_W = 72

type Props = {
  children: ReactNode
  onDelete: () => void
  disabled?: boolean
  /** 为 true 时禁止左滑露出删除（仍可用 disabled 完全关闭删除） */
  swipeDisabled?: boolean
  confirmTitle?: string
  confirmMessage?: string
  className?: string
}

export function SwipeDeleteRow({
  children,
  onDelete,
  disabled = false,
  swipeDisabled = false,
  confirmTitle = '确认删除？',
  confirmMessage = '删除后无法恢复，确定要继续吗？',
  className = '',
}: Props) {
  const noSwipe = disabled || swipeDisabled
  const [slide, setSlide] = useState(0)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const panRef = useRef({ startX: 0, startY: 0, startSlide: 0 })
  const activePointer = useRef<number | null>(null)
  const dragging = useRef(false)
  const surfaceRef = useRef<HTMLDivElement | null>(null)

  const clampSlide = useCallback(
    (v: number) => {
      if (noSwipe) return 0
      return Math.max(-DELETE_STRIP_W, Math.min(0, v))
    },
    [noSwipe],
  )

  const snapSlide = useCallback(
    (v: number) => (v < -DELETE_STRIP_W / 2 ? -DELETE_STRIP_W : 0),
    [],
  )

  useEffect(() => {
    if (swipeDisabled) setSlide(0)
  }, [swipeDisabled])

  const onPointerDown = (e: React.PointerEvent) => {
    if (noSwipe || e.button !== 0) return
    activePointer.current = e.pointerId
    dragging.current = false
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startSlide: slide,
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (noSwipe || activePointer.current !== e.pointerId) return
    const dx = e.clientX - panRef.current.startX
    const dy = e.clientY - panRef.current.startY
    if (!dragging.current) {
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) + 8) {
        dragging.current = true
        setDragActive(true)
        try {
          surfaceRef.current?.setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      } else {
        return
      }
    }
    setSlide(clampSlide(panRef.current.startSlide + dx))
  }

  const endPointer = (e: React.PointerEvent) => {
    if (activePointer.current !== e.pointerId) return
    const el = surfaceRef.current
    if (el?.hasPointerCapture(e.pointerId)) {
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    activePointer.current = null
    setDragActive(false)
    if (dragging.current) {
      setSlide((s) => snapSlide(s))
    }
    dragging.current = false
  }

  const confirmDelete = () => {
    onDelete()
    setDeleteConfirm(false)
    setSlide(0)
  }

  return (
    <div className={`relative isolate overflow-hidden rounded-2xl ${className}`}>
      {!noSwipe && (
        <div
          className="absolute inset-y-0 right-0 z-0 flex"
          style={{ width: DELETE_STRIP_W }}
        >
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation()
              setDeleteConfirm(true)
            }}
            className="flex h-full w-full items-center justify-center bg-rose-600 text-xs font-semibold text-white active:bg-rose-700"
            aria-label="删除"
          >
            删除
          </button>
        </div>
      )}

      <div
        ref={surfaceRef}
        className={`relative z-10 bg-kj-raised ${
          dragActive ? '' : 'transition-[transform] duration-200 ease-out'
        } ${noSwipe ? '' : 'touch-pan-y'}`}
        style={{
          transform: noSwipe ? undefined : `translateX(${slide}px)`,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        {children}
      </div>

      {deleteConfirm &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4">
            <div
              className="w-full max-w-sm rounded-2xl bg-kj-surface p-5 shadow-xl"
              role="dialog"
              aria-modal
              aria-labelledby="swipe-del-title"
            >
              <p
                id="swipe-del-title"
                className="text-base font-bold text-kj-primary"
              >
                {confirmTitle}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-kj-secondary">
                {confirmMessage}
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirm(false)
                    setSlide(0)
                  }}
                  className="flex-1 rounded-xl border border-kj-border-strong py-2.5 text-sm font-semibold text-kj-secondary"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white"
                >
                  删除
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
