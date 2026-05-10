/** localStorage：小票导出是否使用高清（更大 scale，更慢） */
export const RECEIPT_EXPORT_HD_KEY = 'kuaiji_receipt_export_hd'

const JPEG_QUALITY = 0.92

export function readReceiptExportHd(): boolean {
  try {
    return localStorage.getItem(RECEIPT_EXPORT_HD_KEY) === '1'
  } catch {
    return false
  }
}

export function persistReceiptExportHd(hd: boolean): void {
  try {
    localStorage.setItem(RECEIPT_EXPORT_HD_KEY, hd ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/** html2canvas scale：默认较快；高清时跟随屏宽但不超过 2 */
export function getReceiptCaptureScale(): number {
  const dpr =
    typeof window !== 'undefined' && window.devicePixelRatio
      ? window.devicePixelRatio
      : 1
  if (readReceiptExportHd()) {
    return Math.min(2, Math.max(1, dpr))
  }
  return Math.min(1.5, Math.max(1, dpr * 0.75))
}

export const receiptImageMime = 'image/jpeg' as const
export const receiptImageExt = '.jpg' as const
export const receiptImageQuality = JPEG_QUALITY
