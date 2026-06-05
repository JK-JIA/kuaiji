import {
  RECEIPT_BANNER_H,
  RECEIPT_BORDER,
  RECEIPT_BRAND,
  RECEIPT_FONT,
  RECEIPT_HEADER_H,
  RECEIPT_INFO_ROW_H,
  RECEIPT_MUTED,
  RECEIPT_PAGE_BG,
  RECEIPT_PX,
  RECEIPT_SUMMARY_BG,
  RECEIPT_TEXT,
  RECEIPT_TITLE_BODY_GAP,
  RECEIPT_TITLE_H,
  RECEIPT_W,
  receiptDrawBanner,
  receiptDrawCenterQr,
  receiptDrawCenterTitle,
  receiptDrawHeader,
  receiptDrawInfoField,
  receiptRoundRectPath,
  receiptStrokeRoundRect,
} from './receiptCanvasShared'
import { canvasToPngBlob } from './receiptCapture'
import { getReceiptCaptureScale } from './receiptExport'

const INVITE_QR_SIZE = 168
const MSG_BOX_H = 58
const HINT_H = 22

export type ReferralPosterInput = {
  inviterName: string
  inviteCode: string
  /** 扫码跳转（含邀请参数），长按可进官网 */
  inviteUrl: string
}

function measurePosterHeight(): number {
  return (
    RECEIPT_PX +
    RECEIPT_HEADER_H +
    RECEIPT_TITLE_BODY_GAP +
    RECEIPT_TITLE_H +
    10 +
    RECEIPT_INFO_ROW_H * 2 +
    10 +
    MSG_BOX_H +
    14 +
    INVITE_QR_SIZE +
    10 +
    HINT_H +
    RECEIPT_BANNER_H +
    RECEIPT_PX
  )
}

function drawInviteMessageBox(ctx: CanvasRenderingContext2D, y: number): number {
  const boxX = RECEIPT_PX
  const boxW = RECEIPT_W - RECEIPT_PX * 2
  receiptRoundRectPath(ctx, boxX, y, boxW, MSG_BOX_H, 12)
  ctx.fillStyle = RECEIPT_SUMMARY_BG
  ctx.fill()
  receiptStrokeRoundRect(ctx, boxX, y, boxW, MSG_BOX_H, 12, RECEIPT_BORDER)

  ctx.textAlign = 'center'
  ctx.fillStyle = RECEIPT_TEXT
  ctx.font = `600 13px ${RECEIPT_FONT}`
  ctx.fillText('邀请您使用 kuaiji 批发记账', RECEIPT_W / 2, y + 22)
  ctx.fillStyle = RECEIPT_MUTED
  ctx.font = `11px ${RECEIPT_FONT}`
  ctx.fillText('下载安装后填写邀请码，或扫下方二维码', RECEIPT_W / 2, y + 42)
  ctx.textAlign = 'left'
  return y + MSG_BOX_H
}

async function drawPosterToCanvas(
  input: ReferralPosterInput,
): Promise<HTMLCanvasElement> {
  const H = measurePosterHeight()
  const scale = getReceiptCaptureScale()
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(RECEIPT_W * scale)
  canvas.height = Math.round(H * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 不可用')

  ctx.scale(scale, scale)
  ctx.fillStyle = RECEIPT_PAGE_BG
  ctx.fillRect(0, 0, RECEIPT_W, H)

  let y = RECEIPT_PX
  y = await receiptDrawHeader(ctx, y)
  y = receiptDrawCenterTitle(ctx, y, '好友邀请')
  y += RECEIPT_TITLE_BODY_GAP

  const midX = RECEIPT_W / 2 + 4
  receiptDrawInfoField(
    ctx,
    RECEIPT_PX,
    y,
    'person',
    '邀请人',
    input.inviterName.trim() || 'kuaiji 用户',
    midX - RECEIPT_PX - 8,
  )
  y += RECEIPT_INFO_ROW_H
  receiptDrawInfoField(
    ctx,
    RECEIPT_PX,
    y,
    'doc',
    '邀请码',
    input.inviteCode,
    RECEIPT_W - RECEIPT_PX * 2,
  )
  y += RECEIPT_INFO_ROW_H + 10

  y = drawInviteMessageBox(ctx, y)
  y += 14
  y = await receiptDrawCenterQr(ctx, y, INVITE_QR_SIZE, input.inviteUrl)
  y += 10

  ctx.textAlign = 'center'
  ctx.fillStyle = RECEIPT_MUTED
  ctx.font = `11px ${RECEIPT_FONT}`
  ctx.fillText('长按识别二维码 · 进入官网下载', RECEIPT_W / 2, y + 14)
  ctx.fillStyle = RECEIPT_BRAND
  ctx.font = `600 11px ${RECEIPT_FONT}`
  const siteLabel = 'kuaijipf.com'
  ctx.fillText(siteLabel, RECEIPT_W / 2, y + 28)
  ctx.textAlign = 'left'
  y += HINT_H

  receiptDrawBanner(ctx, y)
  return canvas
}

export async function renderReferralInvitePosterBlob(
  input: ReferralPosterInput,
): Promise<Blob> {
  const canvas = await drawPosterToCanvas(input)
  const blob = await canvasToPngBlob(canvas)
  if (!blob) throw new Error('生成邀请图片失败')
  return blob
}
