import { Capacitor, registerPlugin } from '@capacitor/core'

export type BillCameraPermissionResult = {
  camera: boolean
  photos: boolean
}

export interface KuaijiPermissionsPlugin {
  requestCamera(): Promise<{ granted: boolean }>
  requestPhotos(): Promise<{ granted: boolean }>
  requestCameraAndPhotos(): Promise<BillCameraPermissionResult>
}

export const KuaijiPermissions = registerPlugin<KuaijiPermissionsPlugin>(
  'KuaijiPermissions',
)

/** 首次点相机图标：申请相机 + 相册；已授权则不再弹窗 */
export async function requestBillCameraPermissions(): Promise<BillCameraPermissionResult> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      const r = await KuaijiPermissions.requestCameraAndPhotos()
      return { camera: Boolean(r.camera), photos: Boolean(r.photos) }
    } catch {
      return { camera: false, photos: false }
    }
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { camera: false, photos: true }
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    })
    stream.getTracks().forEach((t) => t.stop())
    return { camera: true, photos: true }
  } catch {
    return { camera: false, photos: true }
  }
}

/** 相册选图前检查（权限应在首次进入时已申请） */
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
