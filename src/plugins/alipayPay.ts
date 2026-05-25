import { Capacitor, registerPlugin } from '@capacitor/core'

export type AlipayPayResult = {
  resultStatus: string
  memo: string
  result: string
}

export interface AlipayPayPlugin {
  pay(options: { orderString: string; sandbox?: boolean }): Promise<AlipayPayResult>
}

export const AlipayPay = registerPlugin<AlipayPayPlugin>('AlipayPay')

export function isAlipayPayNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

/** 9000 = 支付成功（同步结果，最终以服务端 notify / 查单为准） */
export function alipaySyncSuccess(resultStatus: string): boolean {
  return resultStatus === '9000'
}
