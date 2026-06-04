import { useCallback, useEffect, useState } from 'react'
import {
  TutorialIllustCustomerCatalog,
  TutorialIllustHomeOverview,
  TutorialIllustProductCatalog,
  TutorialIllustReconcile,
  TutorialIllustSearch,
} from './tutorial/TutorialIllustrations'
import {
  TutorialScreenshot,
  TUTORIAL_STATS_BUYER_OUTSTANDING,
  TUTORIAL_STATS_PRODUCT_PIE,
} from './tutorial/TutorialScreenshot'

type TutorialStep = {
  title: string
  body: string
  imageSrc?: string
  imageAlt?: string
  Illustration?: () => React.JSX.Element
  /** 配图较高时收紧内边距，避免中间区域需下拉 */
  compact?: boolean
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: '首页记账',
    body: '按日看账单与今日概况。轻点「记一笔」手动记账；长按记一笔可语音识别记账，也可点旁边相机按钮拍照识别。',
    Illustration: TutorialIllustHomeOverview,
  },
  {
    title: '核账与欠款',
    body: '未核账=欠款，已收到款账单上点「核账」登记收款，未结清会在右上角标出；',
    Illustration: TutorialIllustReconcile,
  },
  {
    title: '搜索与筛选',
    body: '顶部可搜关键词，并按日期、结清状态筛选。',
    Illustration: TutorialIllustSearch,
  },
  {
    title: '统计：商品销售占比',
    body: '「统计」里用饼图看各商品卖货占比，可切换按斤或按金额。',
    imageSrc: TUTORIAL_STATS_PRODUCT_PIE,
    imageAlt: '商品销售占比饼图示例',
  },
  {
    title: '统计：购买方未核账',
    body: '列表直接看每位客户的未核账欠款，点购买方可跳转账单。',
    imageSrc: TUTORIAL_STATS_BUYER_OUTSTANDING,
    imageAlt: '购买方汇总与未核账列表示例',
  },
  {
    title: '商品管理',
    body: '请在设置里进行商品录入，没录入商品是无法记账的哦。',
    Illustration: TutorialIllustProductCatalog,
    compact: true,
  },
  {
    title: '客户管理',
    body: '设置里维护购买方，记账时快选，统计按客户汇总。',
    Illustration: TutorialIllustCustomerCatalog,
    compact: true,
  },
]

type Props = {
  open: boolean
  onClose: () => void
  /** 完成或跳过时调用，用于标记已看过 */
  onFinished: () => void
}

export function AppTutorialModal({ open, onClose, onFinished }: Props) {
  const [index, setIndex] = useState(0)

  const finish = useCallback(() => {
    onFinished()
    onClose()
  }, [onClose, onFinished])

  useEffect(() => {
    if (open) setIndex(0)
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  const step = TUTORIAL_STEPS[index]
  const last = index >= TUTORIAL_STEPS.length - 1
  const Illustration = step.Illustration

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-tutorial-title"
    >
      <div className="flex min-h-0 flex-1 flex-col items-center justify-end p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:justify-center">
        <div className="flex max-h-[min(92dvh,720px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-kj-border-strong bg-kj-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-kj-border-strong/80 px-4 py-3">
            <div>
              <p className="text-[11px] font-medium text-[#1a7f4c]">
                使用教程 {index + 1}/{TUTORIAL_STEPS.length}
              </p>
              <h2
                id="app-tutorial-title"
                className="mt-0.5 text-base font-semibold text-kj-primary"
              >
                {step.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={finish}
              className="shrink-0 rounded-lg px-2 py-1 text-sm text-kj-muted hover:bg-kj-hover hover:text-kj-secondary"
            >
              跳过
            </button>
          </div>

          <div
            className={`min-h-0 flex-1 overflow-y-auto px-4 ${step.compact ? 'py-3' : 'py-4'}`}
          >
            <div
              className={`rounded-xl bg-kj-raised/80 px-2 ${step.compact ? 'py-2' : 'py-3'}`}
            >
              {step.imageSrc ? (
                <TutorialScreenshot src={step.imageSrc} alt={step.imageAlt ?? ''} />
              ) : Illustration ? (
                <Illustration />
              ) : null}
            </div>
            <p
              className={`text-sm leading-relaxed text-kj-secondary ${
                step.compact ? 'mt-3' : 'mt-4'
              }`}
            >
              {step.body}
            </p>
            <div
              className={`flex justify-center gap-1.5 ${step.compact ? 'mt-3' : 'mt-4'}`}
              aria-hidden
            >
              {TUTORIAL_STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index
                      ? 'w-5 bg-[#2ecc71]'
                      : 'w-1.5 bg-kj-border-strong'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2 border-t border-kj-border-strong/80 p-4">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              className="min-h-[44px] flex-1 rounded-xl border border-kj-border-strong bg-kj-bg px-3 py-2.5 text-sm font-medium text-kj-primary disabled:opacity-40"
            >
              上一步
            </button>
            {last ? (
              <button
                type="button"
                onClick={finish}
                className="min-h-[44px] flex-[1.2] rounded-xl bg-[#2ecc71] px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#27ae60]"
              >
                开始使用
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIndex((i) => i + 1)}
                className="min-h-[44px] flex-[1.2] rounded-xl bg-[#2ecc71] px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#27ae60]"
              >
                下一步
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
