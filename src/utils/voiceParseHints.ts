import type { DoubaoProductLine } from '../types/voiceParse'

type SpokenLineHint = {
  quantity?: string
  unitPrice?: string
  lineAmount?: string
}

function normalizeSpokenUnitToken(raw: string): string {
  const u = String(raw ?? '').trim()
  if (/kg/i.test(u)) return '公斤'
  if (/千克/.test(u)) return '公斤'
  return u
}

/** 按逗号分句，从原话提取每行数量/单价/行金额（与 server/voiceParse.ts 保持一致） */
function parseSpokenLineHints(userText: string): SpokenLineHint[] {
  const parts = userText
    .split(/[，,；;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const hints: SpokenLineHint[] = []

  for (const part of parts) {
    if (!/\d/.test(part)) continue
    if (/买的$/.test(part) && !/(?:包|斤|公斤|千克|kg)/i.test(part)) continue

    /** 批发口语默认：单价*N斤（如 1.2*36斤 → 单价1.2、数量36斤） */
    const mulJin = part.match(
      /(\d+(?:\.\d+)?)\s*[*×xX]\s*(\d+(?:\.\d+)?)\s*斤/,
    )
    if (mulJin) {
      hints.push({
        unitPrice: mulJin[1],
        quantity: `${mulJin[2]}斤`,
      })
      continue
    }

    const packYuan = part.match(/(\d+(?:\.\d+)?)\s*包\s*(\d+(?:\.\d+)?)\s*元/)
    if (packYuan) {
      hints.push({
        quantity: `${packYuan[1]}包`,
        lineAmount: packYuan[2],
      })
      continue
    }

    const jinPrice = part.match(
      /(\d+(?:\.\d+)?)\s*斤\s*(\d+(?:\.\d+)?)\s*(?:元|块|块钱)?/,
    )
    if (jinPrice) {
      hints.push({
        quantity: `${jinPrice[1]}斤`,
        unitPrice: jinPrice[2],
      })
      continue
    }

    const qu = part.match(
      /(\d+(?:\.\d+)?)\s*(斤|千克|公斤|kg|包|箱|袋|个|吨|两)/i,
    )
    if (qu) {
      hints.push({
        quantity: `${qu[1]}${normalizeSpokenUnitToken(qu[2]!)}`,
      })
    }
  }
  return hints
}

/** 用原话规则覆盖 AI 误解析（记一笔填入前） */
export function applySpokenHintsToProductLines(
  userText: string,
  lines: DoubaoProductLine[],
): DoubaoProductLine[] {
  const hints = parseSpokenLineHints(userText)
  if (!hints.length || !lines.length) return lines

  return lines.map((row, i) => {
    const h = hints[i]
    if (!h) return row
    return {
      ...row,
      ...(h.quantity ? { quantity: h.quantity } : {}),
      ...(h.unitPrice ? { unitPrice: h.unitPrice } : {}),
      ...(h.lineAmount ? { lineAmount: h.lineAmount } : {}),
    }
  })
}
