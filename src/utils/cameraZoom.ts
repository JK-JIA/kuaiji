export type CameraZoomRange = {
  min: number
  max: number
  step: number
}

type ZoomCaps = { min: number; max: number; step?: number }

export function getCameraZoomRange(
  track: MediaStreamTrack,
): CameraZoomRange | null {
  const caps = track.getCapabilities?.() as { zoom?: ZoomCaps } | undefined
  const z = caps?.zoom
  if (z == null || typeof z.min !== 'number' || typeof z.max !== 'number') {
    return null
  }
  if (z.max <= z.min) return null
  const step =
    typeof z.step === 'number' && z.step > 0 ? z.step : 0.1
  return { min: z.min, max: z.max, step }
}

export function clampCameraZoom(level: number, range: CameraZoomRange): number {
  const { min, max, step } = range
  const clamped = Math.min(max, Math.max(min, level))
  if (step <= 0) return clamped
  const steps = Math.round((clamped - min) / step)
  return Math.min(max, Math.max(min, min + steps * step))
}

/** 默认 1.0x（设备允许范围内尽量还原原生广角） */
export function defaultCameraZoomLevel(range: CameraZoomRange): number {
  return clampCameraZoom(1, range)
}

export async function applyCameraZoom(
  track: MediaStreamTrack,
  level: number,
  range: CameraZoomRange,
): Promise<number> {
  const zoom = clampCameraZoom(level, range)
  const attempt = async (constraints: MediaTrackConstraints) => {
    await track.applyConstraints(constraints)
  }
  try {
    await attempt({ zoom } as MediaTrackConstraints)
    return zoom
  } catch {
    try {
      await attempt({
        advanced: [{ zoom }] as unknown as MediaTrackConstraintSet[],
      })
      return zoom
    } catch {
      return (
        (track.getSettings?.() as { zoom?: number } | undefined)?.zoom ?? zoom
      )
    }
  }
}
