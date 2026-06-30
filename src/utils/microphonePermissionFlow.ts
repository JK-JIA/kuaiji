import { Capacitor } from '@capacitor/core'

import { KuaijiPermissions } from '../plugins/kuaijiPermissions'



export const MIC_SETTINGS_HINT =

  '麦克风权限未开启，无法使用语音记账。请前往 系统设置 → 应用 → 批发快记 → 权限 中开启麦克风。'



function isNativeAndroid(): boolean {

  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

}



/** 在用户主动使用语音记账前调用；仅永久拒绝后不再弹系统授权 */

export async function ensureMicrophoneForVoice(): Promise<void> {

  if (!isNativeAndroid()) return



  let status: { granted: boolean; canRequest: boolean; blocked?: boolean }

  try {

    status = await KuaijiPermissions.getMicrophoneStatus()

  } catch {

    status = { granted: false, canRequest: true }

  }



  if (status.granted) return



  if (status.blocked || !status.canRequest) {

    throw new Error(MIC_SETTINGS_HINT)

  }



  let result: { granted: boolean; blocked?: boolean }

  try {

    result = await KuaijiPermissions.requestMicrophone()

  } catch {

    throw new Error(MIC_SETTINGS_HINT)

  }



  if (result.granted) return



  if (result.blocked) {

    throw new Error(MIC_SETTINGS_HINT)

  }



  throw new Error('已取消授权，本次无法使用语音记账。')

}

