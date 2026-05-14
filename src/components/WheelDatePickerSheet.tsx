import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

const ROW_H = 44
const VISIBLE = 5
const PICKER_H = ROW_H * VISIBLE
const PAD = (PICKER_H - ROW_H) / 2

function parseYmd(s: string): { y: number; m: number; d: number } | null {
  if (!s || s.length < 10) return null
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return { y, m, d }
}

function joinYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate()
}

function atNoon(y: number, mo: number, d: number): Date {
  return new Date(y, mo - 1, d, 12, 0, 0, 0)
}

function clampYmd(
  y: number,
  m: number,
  d: number,
  minStr: string,
  maxStr: string,
): { y: number; m: number; d: number } {
  const minP = parseYmd(minStr)
  const maxP = parseYmd(maxStr)
  if (!minP || !maxP) return { y, m, d }
  let yy = y
  let mm = m
  let dd = d
  const dim = daysInMonth(yy, mm)
  if (dd > dim) dd = dim
  let t = atNoon(yy, mm, dd)
  const minT = atNoon(minP.y, minP.m, minP.d)
  const maxT = atNoon(maxP.y, maxP.m, maxP.d)
  if (t < minT) return { ...minP }
  if (t > maxT) return { ...maxP }
  return { y: yy, m: mm, d: dd }
}

function PickerColumn({
  labelsSig,
  labels,
  activeIndex,
  onPickIndex,
}: {
  labelsSig: string
  labels: string[]
  activeIndex: number
  onPickIndex: (i: number) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef(labels)
  const onPickRef = useRef(onPickIndex)
  labelsRef.current = labels
  onPickRef.current = onPickIndex

  const snapToIndex = useCallback((i: number, behavior: ScrollBehavior) => {
    const el = scrollRef.current
    if (!el) return
    const n = labelsRef.current.length
    if (n === 0) return
    const clamped = Math.max(0, Math.min(n - 1, i))
    el.scrollTo({ top: clamped * ROW_H, behavior })
  }, [])

  useLayoutEffect(() => {
    const i = Math.max(0, Math.min(labels.length - 1, activeIndex))
    snapToIndex(i, 'instant')
  }, [labelsSig, activeIndex, labels.length, snapToIndex])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const flush = () => {
      const lbs = labelsRef.current
      if (lbs.length === 0) return
      const raw = el.scrollTop / ROW_H
      const i = Math.round(raw)
      const clamped = Math.max(0, Math.min(lbs.length - 1, i))
      if (Math.abs(el.scrollTop - clamped * ROW_H) > 0.5) {
        el.scrollTo({ top: clamped * ROW_H, behavior: 'smooth' })
      }
      onPickRef.current(clamped)
    }

    const onScrollEnd = () => flush()
    let t: ReturnType<typeof setTimeout> | null = null
    const onScroll = () => {
      if (t) clearTimeout(t)
      t = setTimeout(() => {
        t = null
        flush()
      }, 100)
    }

    el.addEventListener('scrollend', onScrollEnd)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scrollend', onScrollEnd)
      el.removeEventListener('scroll', onScroll)
      if (t) clearTimeout(t)
    }
  }, [labelsSig])

  return (
    <div
      className="relative min-w-[4.75rem] flex-1 basis-0 overflow-hidden"
      style={{ height: PICKER_H }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-11 -translate-y-1/2 border-y border-stone-200/70 bg-stone-100/25"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-white via-white/90 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-white via-white/90 to-transparent"
        aria-hidden
      />
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto overscroll-y-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          scrollSnapType: 'y mandatory',
          paddingTop: PAD,
          paddingBottom: PAD,
        }}
      >
        {labels.map((label, i) => (
          <div
            key={`${labelsSig}:${i}`}
            className={`flex h-11 shrink-0 snap-center items-center justify-center text-[15px] leading-none ${
              i === activeIndex
                ? 'font-semibold text-stone-900'
                : 'text-stone-400'
            }`}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}

export type WheelDatePickerSheetProps = {
  open: boolean
  title?: string
  /** yyyy-MM-dd */
  value: string
  minDate: string
  maxDate: string
  onClose: () => void
  onConfirm: (ymd: string) => void
  overlayZClass?: string
}

export function WheelDatePickerSheet({
  open,
  title = '日期',
  value,
  minDate,
  maxDate,
  onClose,
  onConfirm,
  overlayZClass = 'z-[60]',
}: WheelDatePickerSheetProps) {
  const [y, setY] = useState(2026)
  const [m, setM] = useState(1)
  const [d, setD] = useState(1)

  const minP = useMemo(() => parseYmd(minDate), [minDate])
  const maxP = useMemo(() => parseYmd(maxDate), [maxDate])

  const years = useMemo(() => {
    if (!minP || !maxP) return [2024, 2025, 2026]
    const out: number[] = []
    for (let yy = minP.y; yy <= maxP.y; yy++) out.push(yy)
    return out.length ? out : [new Date().getFullYear()]
  }, [minP, maxP])

  const months = useMemo(() => {
    if (!minP || !maxP) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    if (y === minP.y && y === maxP.y) {
      const out: number[] = []
      for (let mo = minP.m; mo <= maxP.m; mo++) out.push(mo)
      return out.length ? out : [1]
    }
    if (y === minP.y) {
      const out: number[] = []
      for (let mo = minP.m; mo <= 12; mo++) out.push(mo)
      return out
    }
    if (y === maxP.y) {
      const out: number[] = []
      for (let mo = 1; mo <= maxP.m; mo++) out.push(mo)
      return out
    }
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  }, [minP, maxP, y])

  const days = useMemo(() => {
    const dim = daysInMonth(y, m)
    let start = 1
    let end = dim
    if (minP && y === minP.y && m === minP.m) start = minP.d
    if (maxP && y === maxP.y && m === maxP.m) end = maxP.d
    const out: number[] = []
    for (let dd = start; dd <= end; dd++) out.push(dd)
    return out.length ? out : [1]
  }, [y, m, minP, maxP])

  const yi = Math.max(0, years.indexOf(y))
  const mi = Math.max(0, months.indexOf(m))
  const di = Math.max(0, days.indexOf(d))

  const yearLabels = useMemo(() => years.map((yy) => `${yy}年`), [years])
  const monthLabels = useMemo(() => months.map((mo) => `${mo}月`), [months])
  const dayLabels = useMemo(() => days.map((dd) => `${dd}日`), [days])

  const yearSig = yearLabels.join('|')
  const monthSig = monthLabels.join('|')
  const daySig = dayLabels.join('|')

  useEffect(() => {
    if (!open) return
    const base =
      parseYmd(value) ??
      parseYmd(minDate) ??
      parseYmd(maxDate) ?? {
        y: new Date().getFullYear(),
        m: new Date().getMonth() + 1,
        d: new Date().getDate(),
      }
    const c = clampYmd(base.y, base.m, base.d, minDate, maxDate)
    setY(c.y)
    setM(c.m)
    setD(c.d)
  }, [open, value, minDate, maxDate])

  useEffect(() => {
    if (!months.includes(m)) setM(months[0] ?? 1)
  }, [months, m])

  useEffect(() => {
    if (!days.includes(d)) setD(days[days.length - 1] ?? 1)
  }, [days, d])

  const handleConfirm = () => {
    const c = clampYmd(y, m, d, minDate, maxDate)
    onConfirm(joinYmd(c.y, c.m, c.d))
    onClose()
  }

  if (!open) return null

  return (
    <div
      className={`fixed inset-0 flex items-end justify-center bg-stone-900/40 backdrop-blur-[2px] sm:items-center sm:p-4 ${overlayZClass}`}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="关闭"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-[min(100vw,28rem)] overflow-hidden rounded-t-[1.35rem] border border-stone-200/90 bg-white shadow-2xl sm:max-w-[420px] sm:rounded-2xl">
        <div className="border-b border-stone-100 px-4 py-3">
          <p className="text-center text-[15px] font-semibold text-stone-900">
            {title}
          </p>
          <p className="mt-0.5 text-center text-xs text-stone-400">
            {y}年{m}月{d}日
          </p>
        </div>

        <div className="flex w-full min-w-0 border-b border-stone-100 px-0.5">
          <PickerColumn
            labelsSig={yearSig}
            labels={yearLabels}
            activeIndex={yi}
            onPickIndex={(i) => setY(years[i] ?? y)}
          />
          <PickerColumn
            labelsSig={monthSig}
            labels={monthLabels}
            activeIndex={mi}
            onPickIndex={(i) => setM(months[i] ?? m)}
          />
          <PickerColumn
            labelsSig={daySig}
            labels={dayLabels}
            activeIndex={di}
            onPickIndex={(i) => setD(days[i] ?? d)}
          />
        </div>

        <div className="flex justify-end gap-2 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-5 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-full bg-stone-900 px-7 py-2.5 text-sm font-semibold text-white hover:bg-stone-800"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
