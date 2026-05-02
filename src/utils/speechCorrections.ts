/**
 * 浏览器语音引擎不可替换，这里做「记账场景」后处理纠错与车牌口语归一化。
 * 可按业务继续扩充规则（顺序靠前优先匹配）。
 */

/** 口语数字 → 阿拉伯数字（车牌里常见） */
const SPOKEN_DIGIT: Record<string, string> = {
  零: '0',
  〇: '0',
  洞: '0',
  幺: '1',
  一: '1',
  壹: '1',
  二: '2',
  两: '2',
  贰: '2',
  三: '3',
  叁: '3',
  四: '4',
  肆: '4',
  五: '5',
  伍: '5',
  六: '6',
  陆: '6',
  七: '7',
  拐: '7',
  柒: '7',
  八: '8',
  捌: '8',
  九: '9',
  玖: '9',
  十: '', // 车牌一般逐位念，单独「十」少见；遇到再扩展
}

/** 省份/特殊车辆简称（单字，用于车牌归一与打分） */
const PROVINCE_RE =
  '[京津沪渝冀晋蒙辽吉黑苏浙皖闽赣鲁豫鄂湘粤桂琼川贵云陕甘青宁新藏警学港澳领使]'

/**
 * 常见同音/近音误识 → 农业记账用词（可按你们品类再加）
 */
const HOMOPHONE_RULES: Array<[RegExp, string]> = [
  [/白鼠/g, '白薯'],
  [/红鼠/g, '红薯'],
  [/紫鼠/g, '紫薯'],
  [/山鼠/g, '山药'],
  [/车牌号是/g, '车牌号'],
  [/牌照是/g, '牌照'],
  [/京唉/g, '京A'],
  [/京诶/g, '京A'],
  [/川唉/g, '川A'],
  [/沪唉/g, '沪A'],
]

/**
 * 尝试把「省份简称 + 可选字母 + 中文数字串」里的中文数字改成阿拉伯数字。
 * 例：京A八八九九 → 京A8899
 */
function normalizePlateChineseDigits(text: string): string {
  return text.replace(
    new RegExp(
      `(${PROVINCE_RE})([A-HJ-NP-Za-zＡ-Ｚ]?)([·•．\\s]*)([一二三四五六七八九零幺两洞拐〇]+)`,
      'g',
    ),
    (_m, prov: string, letter: string, sep: string, cnSeq: string) => {
      const digits = [...cnSeq]
        .map((ch) => SPOKEN_DIGIT[ch] ?? '')
        .join('')
      if (!digits) return prov + letter + sep + cnSeq
      return prov + letter + sep + digits
    },
  )
}

export function correctLedgerSpeech(raw: string): string {
  let t = raw
  for (const [re, rep] of HOMOPHONE_RULES) {
    t = t.replace(re, rep)
  }
  t = normalizePlateChineseDigits(t)
  return t
}

/** 根据候选句是否「像记账/车牌」打分，供 maxAlternatives 择优 */
export function scoreLedgerSpeechLikelihood(text: string): number {
  const t = correctLedgerSpeech(text)
  let s = 0
  if (/斤|公斤|千克|kg|吨|两|包|箱|袋|个|只/.test(t)) s += 4
  if (/[薯瓜果菜米面豆梨苹果柑橘葱姜蒜排骨肉蛋奶]/.test(t)) s += 3
  if (new RegExp(`${PROVINCE_RE}[A-HJ-NP-Za-z]?[0-9]{3,6}`).test(t)) s += 6
  if (/车牌|牌照|尾号|牌号/.test(t)) s += 2
  if (/[0-9０-９]{4,}/.test(t)) s += 1
  return s
}

/** TS lib 对 SpeechRecognitionResult 索引类型不完整 */
export function speechAlternativeTranscript(
  res: SpeechRecognitionResult,
  altIndex: number,
): string {
  const r = res as unknown as { item?: (i: number) => { transcript: string } }
  const byItem = r.item?.(altIndex)?.transcript
  if (byItem !== undefined) return byItem
  const arr = res as unknown as { [i: number]: { transcript: string } }
  return arr[altIndex]?.transcript ?? ''
}

function pickTranscriptWithAlternatives(res: SpeechRecognitionResult): string {
  const len = (res as unknown as { length: number }).length ?? 0
  if (len <= 1) {
    return correctLedgerSpeech(speechAlternativeTranscript(res, 0))
  }
  let best = correctLedgerSpeech(speechAlternativeTranscript(res, 0))
  let bestScore = scoreLedgerSpeechLikelihood(speechAlternativeTranscript(res, 0))
  for (let j = 1; j < len; j++) {
    const raw = speechAlternativeTranscript(res, j)
    const fixed = correctLedgerSpeech(raw)
    const sc = scoreLedgerSpeechLikelihood(raw)
    if (sc > bestScore) {
      bestScore = sc
      best = fixed
    } else if (sc === bestScore && fixed.length > best.length) {
      best = fixed
    }
  }
  return best
}

/** 对单个分句取最优候选（若引擎提供多候选） */
export function transcriptForResult(res: SpeechRecognitionResult): string {
  return pickTranscriptWithAlternatives(res)
}
