/**
 * 图片账单识别：走服务端 /api/bill/parse，视觉模型由服务端 DOUBAO_VISION_MODEL 决定。
 */

import {
  getApiBase,
  getStoredToken,
  parseBillLedger,
} from '../api/ledgerClient'
import type { DoubaoParseResult } from '../types/voiceParse'

export type BillImageParseOptions = {
  apiBase?: string | null
  token?: string | null
  productCatalogPromptSection?: string
  productCatalog?: string[]
  signal?: AbortSignal
}

/** 是否可走服务端图片识别（已配置 VITE_API_URL） */
export function isBillParseConfigured(opts?: BillImageParseOptions): boolean {
  const base = opts?.apiBase?.trim() || getApiBase()?.trim()
  return Boolean(base)
}

export async function parseBillImageWithDoubao(
  imageBase64: string,
  mimeType: string,
  fields: Array<{ id: string; name: string; key?: string }>,
  opts?: BillImageParseOptions,
): Promise<DoubaoParseResult> {
  const base = opts?.apiBase?.trim() || getApiBase()?.trim()
  const token = opts?.token?.trim() ?? getStoredToken()?.trim()

  if (!base) {
    return {
      success: false,
      error: '请先登录并连接云端账本后再使用图片识别。',
    }
  }
  if (!token) {
    return {
      success: false,
      error: '请先登录后再使用图片识别。',
    }
  }

  try {
    const { result, httpStatus } = await parseBillLedger(
      base,
      token,
      imageBase64,
      mimeType,
      fields,
      {
        productCatalogPromptSection: opts?.productCatalogPromptSection,
        productCatalog: opts?.productCatalog,
        signal: opts?.signal,
      },
    )
    if (!result.success && httpStatus === 404) {
      return {
        success: false,
        error: '图片识别服务暂未开通，请稍后再试。',
      }
    }
    return result
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : '无法连接解析服务',
    }
  }
}
