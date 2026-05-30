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
      error:
        '未配置云端 API（VITE_API_URL）。图片识别由服务端豆包视觉模型完成，请在构建/环境变量中配置 API 地址。',
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
        error:
          '服务端 API 版本过旧，尚无图片识别接口（404）。请在服务器执行 git pull 与 docker compose up -d --build 重新部署 ledger-api，并配置 DOUBAO_API_KEY、DOUBAO_VISION_MODEL。',
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
