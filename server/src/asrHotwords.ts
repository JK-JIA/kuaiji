/**
 * 火山流式大模型 ASR：corpus.context 直传热词（见文档 6561/1354869）。
 * 双向流式约 100 tokens，需控制条数与总长度。
 */

/** 批发/口语场景静态热词（与动态账本词合并） */
export const STATIC_ASR_HOTWORDS: string[] = [
  '斤',
  '公斤',
  '千克',
  '排',
  '号',
  '摊位',
  '货款',
  '实收',
  '合计',
  '单价',
  '每斤',
  '对方',
  '客户',
  '买家',
  '购买方',
  '红薯',
  '白薯',
  '土豆',
  '白菜',
  '萝卜',
  '大葱',
  '苹果',
  '香蕉',
  '橘子',
  '猪肉',
  '牛肉',
  '羊肉',
  '排骨',
  '五花肉',
  '元',
  '块',
  '吨',
  '包',
  '箱',
  '袋',
  '个',
  '两',
]

/** 文档称双向流式约 100 tokens；中文词略放宽，由 normalize 截断单条长度 */
const MAX_HOTWORD_ITEMS = 56
const MAX_WORD_RUNE_LEN = 24

function normalizeWord(raw: string): string | undefined {
  const t = raw.normalize('NFKC').trim()
  if (!t) return undefined
  let s = ''
  let n = 0
  for (const ch of t) {
    if (n >= MAX_WORD_RUNE_LEN) break
    if (/[\p{C}\s]/u.test(ch)) continue
    s += ch
    n++
  }
  return s || undefined
}

/** 合并静态词、客户端词，去重并截断，供 corpus.context */
export function mergeVolcAsrHotwords(clientWords: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (w: string | undefined) => {
    if (!w || seen.has(w)) return
    seen.add(w)
    out.push(w)
  }
  for (const w of STATIC_ASR_HOTWORDS) push(normalizeWord(w))
  for (const w of clientWords) push(normalizeWord(w))
  return out.slice(0, MAX_HOTWORD_ITEMS)
}
