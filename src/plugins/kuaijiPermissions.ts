import { Capacitor, registerPlugin } from '@capacitor/core'

export interface KuaijiPermissionsPlugin {
  requestCamera(): Promise<{ granted: boolean }>
  requestPhotos(): Promise<{ granted: boolean }>
}

export const KuaijiPermissions = registerPlugin<KuaijiPermissionsPlugin>(
  'KuaijiPermissions',
)

/** 用户点击拍照时申请相机权限 */
export async function requestCameraPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      const r = await KuaijiPermissions.requestCamera()
      return Boolean(r.granted)
    } catch {
      return false
    }
  }
  if (!navigator.mediaDevices?.getUserMedia) return false
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    })
    stream.getTracks().forEach((t) => t.stop())
    return true
  } catch {
    return false
  }
}

/** 用户点击相册时申请相册权限（Android）；浏览器直接放行 */
export async function requestPhotosPermission(): Promise<boolean> {
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
