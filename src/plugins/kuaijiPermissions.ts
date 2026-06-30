import { Capacitor, registerPlugin } from '@capacitor/core'

export type BillCameraPermissionResult = {
  camera: boolean
  photos: boolean
}

export interface KuaijiPermissionsPlugin {
  requestCamera(): Promise<{ granted: boolean }>
  requestPhotos(): Promise<{ granted: boolean }>
  requestCameraAndPhotos(): Promise<BillCameraPermissionResult>
  getMicrophoneStatus(): Promise<{
    granted: boolean
    canRequest: boolean
    blocked?: boolean
  }>
  requestMicrophone(): Promise<{ granted: boolean; blocked?: boolean }>
}

export const KuaijiPermissions = registerPlugin<KuaijiPermissionsPlugin>(
  'KuaijiPermissions',
)

/** 打开相机界面时仅申请相机权限（不在此调用 getUserMedia，避免与拍照界面重复打开相机） */
export async function ensureCameraPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      const r = await KuaijiPermissions.requestCamera()
      return Boolean(r.granted)
    } catch {
      return false
    }
  }
  return true
}

/** 点击相册选图时再申请图库权限 */
export async function ensurePhotosPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      const r = await KuaijiPermissions.requestPhotos()
      return Boolean(r.granted)
    } catch {
      return false
    }
  }
  return true
}
