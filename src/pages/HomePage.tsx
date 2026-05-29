import { format, parseISO, subDays } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  AddRecordModal,
  type VoiceFormPrefillPayload,
} from '../components/AddRecordModal'
import { CalendarPickerModal } from '../components/CalendarPickerModal'
import { HomeSearchDateRangeBlock } from '../components/HomeSearchDateRangeBlock'
import { ReconcileModal } from '../components/ReconcileModal'
import { RecordCard } from '../components/RecordCard'
import { useAuth } from '../context/AuthContext'
import { useHoldVolcTranscript } from '../hooks/useHoldVolcTranscript'
import {
  getAmountFieldId,
  getPlateValue,
  plateGroupHeading,
  buyerBucketKey,
  isEmptyBuyerBucketKey,
} from '../utils/recordHelpers'
import {
  recordMatchesHomeFilters,
  recordMatchesReconcileFilter,
  type HomeFilterState,
  type ReconcileFilter,
} from '../utils/homeFilters'
import {
  buildStatsDrillDownHint,
  STATS_DRILL_DOWN_STATE_KEY,
  type StatsDrillDownLocationState,
} from '../utils/statsDrillDown'
import { recordMatchesHomeSearch } from '../utils/homeRecordSearch'
import { collectAsrHotwordsFromLedger } from '../utils/asrHotwordsFromLedger'
import { isDoubaoConfigured } from '../utils/doubaoParser'
import {
  buildLedgerRecordForSave,
  getLedgerFormLayout,
  validateRecordForm,
} from '../utils/ledgerRecordDraft'
import { runVoiceParsePipeline } from '../utils/voiceParsePipeline'
import { messageIfPremiumFeatureBlocked } from '../utils/premiumGate'
import { findFieldIdByName, sumAmount } from '../utils/stats'
import type { FieldDef, LedgerRecord, ReconcilePayload } from '../types'
import { useLedger } from '../context/LedgerContext'

export function HomePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const {
    apiBase,
    useRemoteLedger,
    token,
    membershipActive,
  } = useAuth()
  const {
    ready,
    fields,
    records,
    saveRecord,
    removeRecord,
    setRecordPayment,
    productCatalog,
    asrHotwordsSuppressed,
    voiceProductCorrections,
    mergeVoiceCatalogAliases,
  } = useLedger()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<LedgerRecord | null>(null)
  const [reconcileId, setReconcileId] = useState<string | null>(null)
  const [jumpOpen, setJumpOpen] = useState(false)
  const [jumpDate, setJumpDate] = useState(() =>
    format(new Date(), 'yyyy-MM-dd'),
  )
  const [pinnedDates, setPinnedDates] = useState<string[]>([])
  const [searchDraftQuery, setSearchDraftQuery] = useState('')
  const [searchDraftDateFrom, setSearchDraftDateFrom] = useState('')
  const [searchDraftDateTo, setSearchDraftDateTo] = useState('')
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('')
  const [appliedSearchDateFrom, setAppliedSearchDateFrom] = useState('')
  const [appliedSearchDateTo, setAppliedSearchDateTo] = useState('')
  const [searchDraftReconcile, setSearchDraftReconcile] =
    useState<ReconcileFilter>('all')
  const [appliedSearchReconcile, setAppliedSearchReconcile] =
    useState<ReconcileFilter>('all')
  const [appliedDrillPlate, setAppliedDrillPlate] = useState('')
  const [appliedDrillProduct, setAppliedDrillProduct] = useState('')
  const [statsDrillBanner, setStatsDrillBanner] = useState<string | null>(null)
  const [searchDateExpanded, setSearchDateExpanded] = useState(false)
  const [showTopBtn, setShowTopBtn] = useState(false)
  const [voiceParsing, setVoiceParsing] = useState(false)
  const [voiceBanner, setVoiceBanner] = useState<string | null>(null)
  const [voiceFormPrefill, setVoiceFormPrefill] =
    useState<VoiceFormPrefillPayload | null>(null)
  const [voiceFormPrefillKey, setVoiceFormPrefillKey] = useState(0)
  /** 首页长按语音：列表首行占位（语音识别 → 智能解析） */
  const [homeVoiceSlot, setHomeVoiceSlot] = useState<{
    id: string
    phase: 'asr' | 'parse'
    rawText: string
  } | null>(null)
  /** 刚保存或更新的账单：绿色 New、描边；再保存其他条目前一直保留 */
  const [savedHighlightId, setSavedHighlightId] = useState<string | null>(null)

  /** 核账保存完成：绿色描边（无 New） */
  const [reconcileHighlightId, setReconcileHighlightId] = useState<
    string | null
  >(null)

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  /** 已对当前 savedHighlightId 滚过屏，避免核账等更新 records 时再次跳到带 New 的条目 */
  const scrolledForHighlightRef = useRef<string | null>(null)

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    const drill = (location.state as StatsDrillDownLocationState | null)?.[
      STATS_DRILL_DOWN_STATE_KEY
    ]
    if (!drill) return
    setSearchDraftQuery('')
    setAppliedSearchQuery('')
    setSearchDraftDateFrom(drill.dateFrom)
    setSearchDraftDateTo(drill.dateTo)
    setAppliedSearchDateFrom(drill.dateFrom)
    setAppliedSearchDateTo(drill.dateTo)
    setAppliedDrillPlate(drill.plate ?? '')
    setAppliedDrillProduct(drill.product ?? '')
    setStatsDrillBanner(drill.hint ?? buildStatsDrillDownHint(drill))
    setSearchDraftReconcile('all')
    setAppliedSearchReconcile('all')
    setSearchDateExpanded(Boolean(drill.dateFrom || drill.dateTo))
    navigate(location.pathname, { replace: true, state: null })
  }, [location.state, location.pathname, navigate])

  const ledgerLayout = useMemo(() => getLedgerFormLayout(fields), [fields])

  const voiceAsrHotwords = useMemo(
    () =>
      collectAsrHotwordsFromLedger(records, fields, {
        productCatalog,
        asrHotwordsSuppressed,
      }),
    [records, fields, productCatalog, asrHotwordsSuppressed],
  )

  const openAddRecordModal = useCallback(() => {
    setVoiceFormPrefill(null)
    setEditingRecord(null)
    setModalOpen(true)
    setReconcileHighlightId(null)
  }, [])

  const handleModalSave = useCallback(
    async (rec: LedgerRecord) => {
      await saveRecord(rec)
      scrolledForHighlightRef.current = null
      setReconcileHighlightId(null)
      setSavedHighlightId(rec.id)
    },
    [saveRecord],
  )

  const handleReconcileConfirm = useCallback(
    async (id: string, payload: ReconcilePayload) => {
      await setRecordPayment(id, payload)
      setSavedHighlightId(null)
      setReconcileHighlightId(id)
    },
    [setRecordPayment],
  )

  const emptySpeechToastRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runVoicePipeline = useCallback(
    async (rawText: string) => {
      const clearVoiceSlot = () => setHomeVoiceSlot(null)
      const text = rawText.trim()
      if (!text) {
        clearVoiceSlot()
        if (emptySpeechToastRef.current) {
          clearTimeout(emptySpeechToastRef.current)
          emptySpeechToastRef.current = null
        }
        setVoiceBanner('没检测到说话')
        emptySpeechToastRef.current = window.setTimeout(() => {
          emptySpeechToastRef.current = null
          setVoiceBanner(null)
        }, 2200)
        return
      }

      const block = messageIfPremiumFeatureBlocked({
        apiBase,
        token,
        membershipActive,
      })
      if (block) {
        clearVoiceSlot()
        setVoiceBanner(`${block}\n\n请重新语音录入`)
        return
      }

      if (!isDoubaoConfigured({ apiBase })) {
        clearVoiceSlot()
        setVoiceBanner(
          '未配置智能解析服务，无法在首页自动入账。请确认已登录且服务端已配置豆包，或使用「记一笔」手动录入。\n\n请重新语音录入',
        )
        return
      }

      setVoiceParsing(true)
      setVoiceBanner('正在识别中…')
      setHomeVoiceSlot((s) =>
        s
          ? { ...s, phase: 'parse', rawText: text }
          : {
              id: crypto.randomUUID(),
              phase: 'parse',
              rawText: text,
            },
      )
      try {
        const pipeline = await runVoiceParsePipeline({
          asrText: text,
          asrHotwords: voiceAsrHotwords,
          fields: ledgerLayout.sortedFields,
          records,
          productCatalog,
          productCorrections: voiceProductCorrections,
          apiBase,
          token,
        })
        if (!pipeline.success) {
          setVoiceBanner(`${pipeline.error ?? '解析失败'}\n\n请重新语音录入`)
          return
        }

        if (pipeline.catalogWithAliases) {
          await mergeVoiceCatalogAliases(pipeline.catalogWithAliases)
        }

        let { values, lines } = pipeline
        const fuzzy = pipeline

        const err = validateRecordForm(ledgerLayout, {
          values,
          lines,
          dealInput: '',
        })

        const prefillMessages = [err, fuzzy.confirmHint].filter(
          (x): x is string => Boolean(x && String(x).trim()),
        )

        const openVoicePrefillModal = () => {
          setVoiceFormPrefill({
            values,
            lines: lines.map((l) => ({
              product: l.product,
              quantity: l.quantity,
              quantityUnit: l.quantityUnit,
              unitPrice: l.unitPrice,
              lineAmount: l.lineAmount,
            })),
            recordDate: todayStr,
            dealInput: '',
            formError:
              prefillMessages.length > 0
                ? prefillMessages.join('\n\n')
                : fuzzy.needConfirm
                  ? '请核对购买方与商品是否正确后再保存'
                  : null,
          })
          setVoiceFormPrefillKey((k) => k + 1)
          setEditingRecord(null)
          setModalOpen(true)
          setVoiceBanner(null)
        }

        if (err === '缺少商品或数量字段配置') {
          setVoiceBanner(`${err}\n\n请重新语音录入`)
          return
        }

        if (!err && !fuzzy.needConfirm) {
          const rec = buildLedgerRecordForSave(ledgerLayout, {
            values,
            lines,
            dealInput: '',
            recordDate: todayStr,
            recordToEdit: null,
          })
          await saveRecord(rec)
          scrolledForHighlightRef.current = null
          setSavedHighlightId(rec.id)
          setVoiceBanner(null)
          return
        }

        openVoicePrefillModal()
      } catch (e) {
        setVoiceBanner(
          `${e instanceof Error ? e.message : '保存失败'}\n\n请重新语音录入`,
        )
      } finally {
        setVoiceParsing(false)
        clearVoiceSlot()
      }
    },
    [
      apiBase,
      token,
      membershipActive,
      ledgerLayout,
      todayStr,
      saveRecord,
      records,
      fields,
      productCatalog,
      voiceProductCorrections,
      voiceAsrHotwords,
      mergeVoiceCatalogAliases,
    ],
  )

  const voicePipelineRef = useRef(runVoicePipeline)
  voicePipelineRef.current = runVoicePipeline

  const ignoreNextRecordBarClickRef = useRef(false)

  const {
    micBtnRef: homeRecordBarRef,
    recording: voiceRecording,
    holdPressActive: voiceHoldPressActive,
    hint: voiceMicHint,
    canUseVoice: homeVoiceEnabled,
    handleMicPointerDown: homeRecordBarPointerDown,
    handleMicPointerUp: homeRecordBarPointerUp,
  } = useHoldVolcTranscript({
    apiBase,
    token,
    membershipActive,
    asrHotwords: voiceAsrHotwords,
    onSessionFinalized: (t) => {
      setHomeVoiceSlot({
        id: crypto.randomUUID(),
        phase: 'asr',
        rawText: t,
      })
      void voicePipelineRef.current(t)
    },
    onHoldReleased: () => {
      ignoreNextRecordBarClickRef.current = true
    },
    onShortTap: () => {
      ignoreNextRecordBarClickRef.current = true
      openAddRecordModal()
    },
  })

  const onRecordBarClick = () => {
    if (ignoreNextRecordBarClickRef.current) {
      ignoreNextRecordBarClickRef.current = false
      return
    }
    openAddRecordModal()
  }

  const applyHomeSearch = useCallback(
    (reconcileOverride?: ReconcileFilter) => {
      const reconcile =
        reconcileOverride !== undefined
          ? reconcileOverride
          : searchDraftReconcile
      setAppliedSearchQuery(searchDraftQuery.trim())
      setAppliedSearchDateFrom(searchDraftDateFrom.trim())
      setAppliedSearchDateTo(searchDraftDateTo.trim())
      setAppliedSearchReconcile(reconcile)
      setSearchDraftReconcile(reconcile)
    },
    [
      searchDraftQuery,
      searchDraftDateFrom,
      searchDraftDateTo,
      searchDraftReconcile,
    ],
  )

  const clearHomeSearch = useCallback(() => {
    setSearchDraftQuery('')
    setSearchDraftDateFrom('')
    setSearchDraftDateTo('')
    setSearchDraftReconcile('all')
    setAppliedSearchQuery('')
    setAppliedSearchDateFrom('')
    setAppliedSearchDateTo('')
    setAppliedSearchReconcile('all')
    setAppliedDrillPlate('')
    setAppliedDrillProduct('')
    setStatsDrillBanner(null)
    setSearchDateExpanded(false)
  }, [])

  const quickReconcileFilter = useCallback(
    (next: 'settled' | 'pending') => {
      const toggleOff = appliedSearchReconcile === next
      applyHomeSearch(toggleOff ? 'all' : next)
    },
    [appliedSearchReconcile, applyHomeSearch],
  )

  const appliedSearchLower = useMemo(
    () => appliedSearchQuery.toLowerCase(),
    [appliedSearchQuery],
  )

  const { appliedDateFrom, appliedDateTo } = useMemo(() => {
    let f = appliedSearchDateFrom.trim()
    let t = appliedSearchDateTo.trim()
    if (f && t && f > t) [f, t] = [t, f]
    return { appliedDateFrom: f, appliedDateTo: t }
  }, [appliedSearchDateFrom, appliedSearchDateTo])

  const drillFilter = useMemo<HomeFilterState>(
    () => ({
      plate: appliedDrillPlate,
      product: appliedDrillProduct,
      reconcile: 'all',
    }),
    [appliedDrillPlate, appliedDrillProduct],
  )

  const drillFilterActive = Boolean(
    appliedDrillPlate.trim() || appliedDrillProduct.trim(),
  )

  const homeSearchModeActive =
    Boolean(appliedSearchLower) ||
    Boolean(appliedDateFrom || appliedDateTo) ||
    appliedSearchReconcile !== 'all' ||
    drillFilterActive

  const recordsForHomeTimeline = useMemo(() => {
    const hasDateRange = Boolean(appliedDateFrom || appliedDateTo)
    const hasReconcile = appliedSearchReconcile !== 'all'
    if (
      !appliedSearchLower &&
      !hasDateRange &&
      !hasReconcile &&
      !drillFilterActive
    ) {
      return records
    }
    let list = records
    if (appliedSearchLower) {
      list = list.filter((r) =>
        recordMatchesHomeSearch(r, fields, appliedSearchLower),
      )
    }
    if (appliedDateFrom || appliedDateTo) {
      list = list.filter((r) => {
        const d = r.date
        if (appliedDateFrom && d < appliedDateFrom) return false
        if (appliedDateTo && d > appliedDateTo) return false
        return true
      })
    }
    if (drillFilterActive) {
      list = list.filter((r) =>
        recordMatchesHomeFilters(r, fields, drillFilter),
      )
    }
    if (hasReconcile) {
      list = list.filter((r) =>
        recordMatchesReconcileFilter(r, fields, appliedSearchReconcile),
      )
    }
    return list
  }, [
    records,
    fields,
    appliedSearchLower,
    appliedDateFrom,
    appliedDateTo,
    appliedSearchReconcile,
    drillFilterActive,
    drillFilter,
  ])

  const grouped = useMemo(() => {
    const map = new Map<string, typeof records>()
    for (const r of recordsForHomeTimeline) {
      const arr = map.get(r.date) || []
      arr.push(r)
      map.set(r.date, arr)
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => b.createdAt - a.createdAt)
    }
    const dates = [...map.keys()].sort((a, b) => b.localeCompare(a))
    return { map, dates }
  }, [recordsForHomeTimeline])

  const visibleTimelineDates = useMemo(() => {
    const s = new Set<string>(grouped.dates)
    for (const p of pinnedDates) s.add(p)
    return [...s].sort((a, b) => b.localeCompare(a))
  }, [grouped.dates, pinnedDates])

  /** 语音占位时若「今天」尚无分组，也渲染今天区块；搜索时仅展示有结果的日期（日期仍按新→旧） */
  const displayTimelineDates = useMemo(() => {
    const base = homeSearchModeActive
      ? [...grouped.dates]
      : [...visibleTimelineDates]
    if (homeVoiceSlot && !base.includes(todayStr)) {
      return [todayStr, ...base]
    }
    return base
  }, [
    homeSearchModeActive,
    grouped.dates,
    visibleTimelineDates,
    homeVoiceSlot,
    todayStr,
  ])

  const todayRecords = records.filter((r) => r.date === todayStr)
  const amountId = getAmountFieldId(fields) ?? findFieldIdByName(fields, '金额')
  const todaySum = sumAmount(todayRecords, amountId)
  const searchResultCount = recordsForHomeTimeline.length
  const searchResultSum = amountId
    ? sumAmount(recordsForHomeTimeline, amountId)
    : 0

  const ledgerDateBounds = useMemo(() => {
    if (records.length === 0) return { min: '', max: '' }
    let minD = records[0].date
    let maxD = records[0].date
    for (const r of records) {
      if (r.date < minD) minD = r.date
      if (r.date > maxD) maxD = r.date
    }
    return { min: minD, max: maxD }
  }, [records])

  const recordDateSet = useMemo(
    () => new Set(records.map((r) => r.date)),
    [records],
  )

  const reconcileRecord = useMemo(
    () =>
      reconcileId ? records.find((r) => r.id === reconcileId) ?? null : null,
    [reconcileId, records],
  )

  const scrollToDate = useCallback((dateKey: string) => {
    const el = sectionRefs.current[dateKey]
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  useEffect(() => {
    const onScroll = () => {
      setShowTopBtn(window.scrollY > 280)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (voiceRecording) {
      if (emptySpeechToastRef.current) {
        clearTimeout(emptySpeechToastRef.current)
        emptySpeechToastRef.current = null
      }
      setVoiceBanner(null)
    }
  }, [voiceRecording])

  useEffect(() => {
    return () => {
      if (emptySpeechToastRef.current) {
        clearTimeout(emptySpeechToastRef.current)
      }
    }
  }, [])

  /** 若高亮账单已删除，清除 id */
  useEffect(() => {
    if (!savedHighlightId) return
    if (!records.some((r) => r.id === savedHighlightId)) {
      setSavedHighlightId(null)
    }
  }, [records, savedHighlightId])

  /** 筛选/搜索下当前列表不展示该条时，不保留无意义的 New 状态 */
  useEffect(() => {
    if (!savedHighlightId) return
    if (!recordsForHomeTimeline.some((r) => r.id === savedHighlightId)) {
      setSavedHighlightId(null)
    }
  }, [recordsForHomeTimeline, savedHighlightId])

  /** 仅「记一笔/语音」新设高亮时滚屏一次；核账等引起的 records 更新不再重滚 */
  useEffect(() => {
    if (!savedHighlightId) {
      scrolledForHighlightRef.current = null
      return
    }
    if (!records.some((r) => r.id === savedHighlightId)) return
    if (scrolledForHighlightRef.current === savedHighlightId) return
    scrolledForHighlightRef.current = savedHighlightId
    const id = savedHighlightId
    const rec = records.find((r) => r.id === id)
    const t = window.setTimeout(() => {
      if (rec) {
        sectionRefs.current[rec.date]?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      }
      document
        .querySelector(`[data-home-record-id="${id}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)
    return () => clearTimeout(t)
  }, [savedHighlightId, records])

  /** 若高亮账单已被删除/筛掉，清空核账绿色框选中 */
  useEffect(() => {
    if (!reconcileHighlightId) return
    if (!records.some((r) => r.id === reconcileHighlightId)) {
      setReconcileHighlightId(null)
    }
  }, [records, reconcileHighlightId])

  useEffect(() => {
    if (!reconcileHighlightId) return
    if (!recordsForHomeTimeline.some((r) => r.id === reconcileHighlightId)) {
      setReconcileHighlightId(null)
    }
  }, [recordsForHomeTimeline, reconcileHighlightId])

  const scrollTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const headerDayLabel = (dateKey: string) => {
    const d = parseISO(dateKey + 'T12:00:00')
    if (dateKey === todayStr) return '今天'
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
    if (dateKey === yesterday) return '昨天'
    return format(d, 'M月d日 EEEE', { locale: zhCN })
  }

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-kj-muted">
        加载本地数据中…
      </div>
    )
  }

  return (
    <div className="kuaiji-page">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2 px-4">
        <div className="min-w-0">
          <h1
            className="font-light italic tracking-[0.12em] text-transparent"
            style={{
              fontSize: '1.75rem',
              lineHeight: 1.15,
              background: 'linear-gradient(120deg, #1a7f4c 0%, #2ecc71 45%, #27ae60 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
            }}
            aria-label="kuaiji 记账"
          >
            kuaiji
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-kj-secondary">
            按日账单 · 购买方分组 · 核账与统计，批发场景随身记。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setJumpOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-kj-border-strong bg-kj-surface px-4 py-2 text-sm font-medium text-kj-primary shadow-sm hover:bg-kj-hover"
        >
          <CalendarGlyph className="h-4 w-4 text-kj-secondary" aria-hidden />
          选择日期
        </button>
      </header>

      <div className="mx-4 mb-3">
        <form
          className="flex items-center gap-2 rounded-2xl border border-kj-border-strong/80 bg-kj-surface px-3 py-2 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault()
            applyHomeSearch()
          }}
        >
          <SearchGlyph
            className="h-4 w-4 shrink-0 text-kj-muted"
            aria-hidden
          />
          <input
            type="search"
            enterKeyHint="search"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={searchDraftQuery}
            onChange={(e) => setSearchDraftQuery(e.target.value)}
            placeholder="搜索全部字段…"
            className="min-w-0 flex-1 bg-transparent text-sm text-kj-primary outline-none placeholder:text-kj-muted"
            aria-label="搜索账单"
          />
          <button
            type="button"
            onClick={() => setSearchDateExpanded((v) => !v)}
            className={`shrink-0 rounded-lg p-2 text-kj-secondary transition-colors hover:bg-kj-hover ${
              searchDateExpanded ||
              searchDraftDateFrom ||
              searchDraftDateTo ||
              appliedSearchDateFrom ||
              appliedSearchDateTo
                ? 'bg-kj-raised text-kj-primary ring-1 ring-kj-border-strong'
                : ''
            }`}
            aria-expanded={searchDateExpanded}
            aria-label="记账日区间"
            title="记账日区间"
          >
            <SearchOptionsBarsGlyph className="h-5 w-5" />
          </button>
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-[#2ecc71] px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-[#27ae60] active:bg-[#22a85a]"
          >
            搜索
          </button>
        </form>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => quickReconcileFilter('settled')}
            className={
              appliedSearchReconcile === 'settled'
                ? 'kuaiji-chip kuaiji-chip-active-settled'
                : 'kuaiji-chip kuaiji-chip-idle'
            }
            aria-pressed={appliedSearchReconcile === 'settled'}
          >
            已结清
          </button>
          <button
            type="button"
            onClick={() => quickReconcileFilter('pending')}
            className={
              appliedSearchReconcile === 'pending'
                ? 'kuaiji-chip kuaiji-chip-active-pending'
                : 'kuaiji-chip kuaiji-chip-idle'
            }
            aria-pressed={appliedSearchReconcile === 'pending'}
          >
            未结清
          </button>
        </div>
        {searchDateExpanded && (
          <div className="mt-2 rounded-2xl border border-kj-border-strong/80 bg-kj-surface px-3 py-2.5 shadow-sm">
            <HomeSearchDateRangeBlock
              dateFrom={searchDraftDateFrom}
              dateTo={searchDraftDateTo}
              minDate={ledgerDateBounds.min || todayStr}
              maxDate={ledgerDateBounds.max || todayStr}
              onChange={(from, to) => {
                setSearchDraftDateFrom(from)
                setSearchDraftDateTo(to)
              }}
            />
          </div>
        )}
        {homeSearchModeActive ? (
          <div className="mt-2 flex flex-col gap-2.5 rounded-2xl border border-kj-border-strong/80 bg-kj-raised px-3 py-2.5 shadow-sm">
            <p className="min-w-0 text-xs leading-relaxed text-kj-secondary sm:text-sm">
              {[
                statsDrillBanner,
                appliedSearchLower
                  ? `关键词「${appliedSearchQuery.slice(0, 48)}${appliedSearchQuery.length > 48 ? '…' : ''}」`
                  : null,
                appliedDateFrom || appliedDateTo
                  ? `记账日 ${appliedDateFrom || '不限'}～${appliedDateTo || '不限'}`
                  : null,
                appliedSearchReconcile === 'settled'
                  ? '已结清'
                  : appliedSearchReconcile === 'pending'
                    ? '未结清'
                    : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <button
              type="button"
              onClick={clearHomeSearch}
              className="w-full rounded-xl border border-kj-border-strong bg-kj-surface px-4 py-2.5 text-sm font-semibold text-kj-primary shadow-sm transition-colors hover:bg-kj-hover active:bg-kj-hover sm:w-auto sm:self-end"
              aria-label="清除筛选条件"
            >
              清除筛选
            </button>
          </div>
        ) : null}
      </div>

      <section className="kuaiji-card mx-4 mb-3 p-4 text-left">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="kuaiji-icon-well h-9 w-9">
              <WalletGlyph className="h-[18px] w-[18px]" />
            </div>
            <div>
              <p className="text-sm font-medium text-kj-primary">
                {homeSearchModeActive ? '结果概况' : '今日概况'}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-6">
          <div>
            <p className="text-2xl font-bold tabular-nums text-kj-primary">
              {homeSearchModeActive ? searchResultCount : todayRecords.length}
            </p>
            <p className="mt-0.5 text-xs text-kj-secondary">
              {homeSearchModeActive ? '匹配笔数' : '今日笔数'}
            </p>
          </div>
          {amountId && (
            <div>
              <p className="text-2xl font-bold tabular-nums text-kj-primary">
                {homeSearchModeActive ? searchResultSum : todaySum}
              </p>
              <p className="mt-0.5 text-xs text-kj-secondary">
                {homeSearchModeActive ? '匹配金额合计' : '今日金额合计'}
              </p>
            </div>
          )}
        </div>
        {!amountId && (
          <p className="mt-3 text-xs text-kj-muted">
            默认已含「金额」字段；若被删除可在设置里加回。
          </p>
        )}
      </section>

      {useRemoteLedger && (
        <div className="kuaiji-banner-cloud mx-4 mb-3 flex items-start gap-2.5 px-3.5 py-3">
          <CloudOkGlyph className="kuaiji-banner-cloud-icon mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-left text-xs leading-relaxed">
            <span className="kuaiji-banner-cloud-title font-semibold">云端已同步</span>
            <span className="kuaiji-banner-cloud-body font-normal">
              {' '}
              点账单编辑，左滑删除。
              {homeVoiceEnabled ? ' 长按「记一笔」可语音记账。' : ''}
            </span>
          </p>
        </div>
      )}

      {apiBase && token && !membershipActive && (
        <div className="kuaiji-banner-warning mx-4 mb-3 flex items-start gap-2.5 px-3.5 py-3">
          <HintBulbGlyph className="mt-0.5 h-[15px] w-[15px] shrink-0 opacity-90" />
          <p className="text-left text-xs leading-relaxed">
            <span className="font-semibold">未开通云备份会员</span>
            <span className="opacity-90">
              {' '}
              已登录但需兑换会员码后才会同步账本至服务器；语音识别与智能识别亦需有效会员。请打开{' '}
            </span>
            <Link
              to="/settings"
              className="font-semibold underline-offset-2 hover:underline"
            >
              设置
            </Link>
            兑换。
          </p>
        </div>
      )}

      {!useRemoteLedger && (
        <div className="kuaiji-banner-success mx-4 mb-3 flex items-start gap-2.5 px-3.5 py-3">
          <HintBulbGlyph className="mt-0.5 h-[15px] w-[15px] shrink-0 text-kj-brand" />
          <div className="text-left text-xs leading-relaxed">
            <span className="font-semibold">提示：</span>
            <span className="font-normal opacity-90">
              {apiBase
                ? '数据仅保存在本机，卸载或清理存储会丢失；请定期在「设置 → 导入导出」备份账单（CSV）。登录并开通会员后可使用云端同步、语音识别与智能识别。'
                : '当前为离线使用，数据仅存本机。点击账单可编辑，向左滑删除前会二次确认。'}
            </span>
          </div>
        </div>
      )}

      <div className="px-4">
        {records.length > 0 &&
          homeSearchModeActive &&
          recordsForHomeTimeline.length === 0 && (
            <p className="mb-4 rounded-2xl border border-dashed border-kj-border-strong bg-kj-surface py-10 text-center text-sm text-kj-secondary">
              无匹配结果，请调整关键词或日期区间。
            </p>
          )}

        {visibleTimelineDates.length === 0 &&
          records.length === 0 &&
          !homeVoiceSlot && (
          <p className="rounded-2xl border border-dashed border-kj-border-strong bg-kj-surface py-12 text-center text-kj-muted">
            暂无记录，轻点下方记一笔手动录入，长按同按钮语音识别。
          </p>
        )}

        {displayTimelineDates.map((dateKey) => {
          const list = grouped.map.get(dateKey) || []
          const showVoiceSlot =
            dateKey === todayStr && homeVoiceSlot !== null
          return (
            <section
              key={dateKey}
              ref={(el) => {
                sectionRefs.current[dateKey] = el
              }}
              className="mb-5 scroll-mt-20"
            >
              <h2 className="sticky top-0 z-10 mb-2 border-b border-kj-border/90 bg-kj-bg/95 py-2 text-sm font-bold text-kj-primary backdrop-blur">
                {headerDayLabel(dateKey)}{' '}
                <span className="font-normal text-kj-muted">{dateKey}</span>
              </h2>
              {list.length === 0 && !showVoiceSlot ? (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-kj-border-strong bg-kj-surface py-8 text-sm text-kj-secondary">
                  <ClipboardGlyph className="h-5 w-5 shrink-0 text-kj-muted" />
                  <span>当日暂无账单</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {showVoiceSlot && homeVoiceSlot && (
                    <HomeVoicePipelineSlot
                      key={homeVoiceSlot.id}
                      phase={homeVoiceSlot.phase}
                      rawText={homeVoiceSlot.rawText}
                    />
                  )}
                  {list.length > 0 &&
                    groupRecordsByPlate(list, fields).map(([plate, recs]) => (
                      <div key={`${dateKey}-${plate}`}>
                        <p className="mb-2 text-xs font-semibold tracking-wide text-kj-secondary">
                          {plateGroupHeading(plate, fields)}
                        </p>
                        <ul className="space-y-2.5">
                          {recs.map((r) => (
                          <li
                            key={r.id}
                            data-home-record-id={r.id}
                          >
                            <RecordCard
                              record={r}
                              fields={fields}
                              productCatalog={productCatalog}
                              showSavedHighlightBadge={
                                r.id === savedHighlightId
                              }
                              showReconcileHighlight={
                                r.id === reconcileHighlightId
                              }
                              onEdit={(rec) => {
                                setVoiceFormPrefill(null)
                                setEditingRecord(rec)
                                setModalOpen(true)
                              }}
                                onDelete={(id) => {
                                  void removeRecord(id)
                                }}
                                onReconcile={(rec) => {
                                  setReconcileHighlightId(null)
                                  setReconcileId(rec.id)
                                }}
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                </div>
              )}
            </section>
          )
        })}
      </div>

      {showTopBtn && (
        <button
          type="button"
          onClick={scrollTop}
          className="fixed bottom-52 right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-kj-border-strong bg-kj-surface text-kj-secondary shadow-md backdrop-blur hover:bg-kj-hover"
          aria-label="回到顶部"
        >
          <ChevronUpGlyph className="h-5 w-5" />
        </button>
      )}

      {(voiceParsing || voiceBanner || voiceMicHint) && (
        <div
          className="fixed bottom-[9.5rem] left-1/2 z-30 w-max min-w-0 max-w-[min(32rem,calc(100vw-2rem-env(safe-area-inset-left)-env(safe-area-inset-right)))] -translate-x-1/2 rounded-xl border border-kj-border-strong/80 bg-kj-surface/95 px-3 py-2 text-sm leading-snug text-kj-primary shadow-md backdrop-blur-md whitespace-pre-line break-words"
          role="status"
        >
          {voiceMicHint
            ? voiceMicHint
            : voiceBanner ??
              (voiceParsing ? '正在识别中…' : '')}
        </div>
      )}


      <div className="pointer-events-none fixed bottom-20 left-1/2 z-30 w-full max-w-lg -translate-x-1/2 px-4">
        <div className="pointer-events-auto mx-auto flex w-full max-w-full flex-col items-center gap-2">
          {homeVoiceEnabled && (voiceHoldPressActive || voiceRecording) ? (
            <div
              role="status"
              className="flex min-h-10 w-[min(100%,18rem)] items-center justify-center gap-2 rounded-2xl border border-kj-border-strong/80 bg-kj-surface/95 px-3 py-2 shadow-md backdrop-blur-sm"
            >
              {voiceRecording ? (
                <>
                  <span className="text-sm font-semibold text-kj-primary">
                    收音中
                  </span>
                  <span className="flex h-5 items-end gap-0.5" aria-hidden>
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className="recording-wave-bar inline-block w-1 rounded-sm bg-[#2ecc71]"
                        style={{
                          height: '1rem',
                          animationDelay: `${i * 0.12}s`,
                        }}
                      />
                    ))}
                  </span>
                  <span className="text-xs font-medium text-kj-secondary">
                    松手结束
                  </span>
                </>
              ) : (
                <>
                  <span
                    className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#2ecc71]"
                    aria-hidden
                  />
                  <span className="text-sm font-semibold text-kj-primary">
                    请继续按住…
                  </span>
                  <span className="text-xs text-kj-muted">即将开始收音</span>
                </>
              )}
            </div>
          ) : null}
          <button
            ref={homeRecordBarRef}
            type="button"
            style={{ touchAction: 'none' }}
            onPointerDown={homeRecordBarPointerDown}
            onPointerUp={homeRecordBarPointerUp}
            onPointerCancel={homeRecordBarPointerUp}
            onClick={onRecordBarClick}
            className={
              voiceRecording
                ? 'flex min-h-11 w-[52%] max-w-[220px] min-w-[10.5rem] select-none items-center justify-center gap-2 rounded-full bg-neutral-500 py-2.5 pl-3 pr-3 text-sm font-semibold tracking-wide text-white shadow-lg'
                : homeVoiceEnabled
                  ? `flex min-h-11 w-[52%] max-w-[220px] min-w-[10.5rem] select-none items-center justify-center gap-2 rounded-full bg-black py-2.5 pl-3 pr-3 text-sm font-semibold tracking-wide text-white shadow-lg active:bg-neutral-500 ${
                      voiceHoldPressActive && !voiceRecording
                        ? 'ring-2 ring-[#2ecc71]/55 ring-offset-2 ring-offset-kj-bg'
                        : ''
                    }`
                  : 'flex min-h-11 w-[52%] max-w-[220px] min-w-[10.5rem] select-none items-center justify-center gap-2 rounded-full bg-black py-2.5 pl-3 pr-3 text-sm font-semibold tracking-wide text-neutral-500 shadow-lg'
            }
            title={
              voiceRecording
                ? undefined
                : '轻点：手动记账；长按：语音识别并保存'
            }
            aria-label={
              voiceRecording
                ? '录音中，松手结束'
                : '记一笔：轻点手动记账，长按语音识别'
            }
          >
            {voiceRecording ? (
              <>
                <HomeMiniMicGlyph className="h-5 w-5 shrink-0 text-white" />
                <span className="shrink-0">松手结束</span>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 text-center">记一笔</span>
                <span
                  className={
                    homeVoiceEnabled
                      ? 'shrink-0 text-white/75'
                      : 'shrink-0 text-neutral-500'
                  }
                  aria-hidden
                >
                  <HomeMiniMicGlyph className="h-5 w-5" />
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      <AddRecordModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditingRecord(null)
          setVoiceFormPrefill(null)
        }}
        fields={fields}
        onSave={handleModalSave}
        recordToEdit={editingRecord}
        recordDates={recordDateSet}
        voiceFormPrefill={voiceFormPrefill}
        voiceFormPrefillKey={voiceFormPrefillKey}
      />

      <ReconcileModal
        open={reconcileId !== null && reconcileRecord !== null}
        record={reconcileRecord}
        fields={fields}
        onClose={() => setReconcileId(null)}
        onConfirm={(id, payload) => void handleReconcileConfirm(id, payload)}
      />

      <CalendarPickerModal
        open={jumpOpen}
        onClose={() => setJumpOpen(false)}
        value={jumpDate}
        onChangeValue={setJumpDate}
        recordDates={recordDateSet}
        confirmLabel="跳转"
        onConfirm={() => {
          setPinnedDates((prev) =>
            prev.includes(jumpDate) ? prev : [...prev, jumpDate],
          )
          window.setTimeout(() => scrollToDate(jumpDate), 120)
        }}
      />

    </div>
  )
}

function SearchOptionsBarsGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="4" x2="20" y1="7" y2="7" />
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="17" y2="17" />
    </svg>
  )
}

function SearchGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.75}
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
      />
    </svg>
  )
}

function HomeMiniMicGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  )
}

function HomeVoicePipelineSlot({
  phase,
  rawText,
}: {
  phase: 'asr' | 'parse'
  rawText: string
}) {
  const label =
    phase === 'asr' ? '语音识别中…' : '智能识别中，正在写入账单…'
  const snippet = rawText.trim().slice(0, 200)
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-dashed border-kj-settled-border bg-kj-surface p-4 shadow-sm"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="pointer-events-none absolute inset-0 animate-pulse bg-kj-brand/5" />
      <div className="relative flex items-start gap-3">
        <div className="kuaiji-icon-well mt-0.5 h-9 w-9">
          <HomeVoiceSlotGlyph className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-kj-primary">{label}</p>
          {snippet ? (
            <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-kj-secondary">
              「{snippet}」
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-kj-muted">请稍候…</p>
          )}
        </div>
      </div>
    </div>
  )
}

function HomeVoiceSlotGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    </svg>
  )
}

function groupRecordsByPlate(
  list: LedgerRecord[],
  fields: FieldDef[],
): [string, LedgerRecord[]][] {
  const m = new Map<string, LedgerRecord[]>()
  const order: string[] = []
  for (const r of list) {
    const p = buyerBucketKey(getPlateValue(r, fields), fields)
    if (!m.has(p)) {
      m.set(p, [])
      order.push(p)
    }
    m.get(p)!.push(r)
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => b.createdAt - a.createdAt)
  }
  order.sort((a, b) => {
    const aEmpty = isEmptyBuyerBucketKey(a, fields)
    const bEmpty = isEmptyBuyerBucketKey(b, fields)
    if (aEmpty && !bEmpty) return 1
    if (bEmpty && !aEmpty) return -1
    const aRecs = m.get(a)!
    const bRecs = m.get(b)!
    const aLatest = Math.max(...aRecs.map((r) => r.createdAt))
    const bLatest = Math.max(...bRecs.map((r) => r.createdAt))
    if (bLatest !== aLatest) return bLatest - aLatest
    return a.localeCompare(b, 'zh-CN')
  })
  return order.map((p) => [p, m.get(p)!])
}

function WalletGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.6}
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V7.5A2.25 2.25 0 015.25 5.25h11.379a1.5 1.5 0 011.06.439l2.872 2.872a1.5 1.5 0 01.439 1.06V12M16.5 15.75h.008v.008H16.5v-.008z"
      />
    </svg>
  )
}

function ClipboardGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
      />
    </svg>
  )
}

function CalendarGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5a2.25 2.25 0 002.25-2.25m-18 0v-7.5A2.25 2.25 0 017.5 9h9a2.25 2.25 0 012.25 2.25v7.5"
      />
    </svg>
  )
}

function HintBulbGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
      />
    </svg>
  )
}

function CloudOkGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 15a4.5 4.5 0 004.5 4.5h7.692a4.5 4.5 0 001.305-8.772 5.25 5.25 0 00-10.233 2.102A3.75 3.75 0 002.25 15z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75l1.5 1.5 3-3"
      />
    </svg>
  )
}

function ChevronUpGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
    </svg>
  )
}
