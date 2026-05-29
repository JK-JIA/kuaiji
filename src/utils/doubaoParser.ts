/**
 * 智能解析：仅走服务端 /api/voice/parse，模型由服务端 DOUBAO_MODEL 决定。
 * 客户端无需配置 VITE_DOUBAO_API_KEY / VITE_DOUBAO_MODEL。
 */

import { getApiBase, getStoredToken, parseVoiceLedger } from '../api/ledgerClient'
import type { DoubaoParseResult, DoubaoProductLine } from '../types/voiceParse'

export type { DoubaoParseResult, DoubaoProductLine }

export type DoubaoParseOptions = {
  apiBase?: string | null
  token?: string | null
  /** @deprecated 使用 productCatalogPromptSection */
  productCatalog?: string[]
  productCatalogPromptSection?: string
}

/** 是否可走服务端智能解析（已配置 VITE_API_URL） */
export function isDoubaoConfigured(opts?: DoubaoParseOptions): boolean {
  const base = opts?.apiBase?.trim() || getApiBase()?.trim()
  return Boolean(base)
}

export async function parseWithDoubao(
  text: string,
  fields: Array<{ id: string; name: string; key?: string }>,
  opts?: DoubaoParseOptions,
): Promise<DoubaoParseResult> {
  const base = opts?.apiBase?.trim() || getApiBase()?.trim()
  const token = opts?.token?.trim() ?? getStoredToken()?.trim()

  if (!base) {
    return {
      success: false,
      error:
        '未配置云端 API（VITE_API_URL）。智能解析由服务端豆包完成，请在构建/环境变量中配置 API 地址。',
    }
  }
  if (!token) {
    return {
      success: false,
      error: '请先登录后再使用智能解析。',
    }
  }

  try {
    const { result, httpStatus } = await parseVoiceLedger(
      base,
      token,
      text,
      fields,
      {
        productCatalogPromptSection: opts?.productCatalogPromptSection,
        productCatalog: opts?.productCatalog,
      },
    )
    if (!result.success && httpStatus === 404) {
      return {
        success: false,
        error:
          '服务端尚未支持语音解析（404）。请更新并重启 ledger-api，并配置 DOUBAO_API_KEY、DOUBAO_MODEL。',
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
