import {
  readPendingInviteCode,
  writePendingInviteCode,
} from './referralInvite'

/** 登录成功后尝试绑定本地暂存的邀请码 */
export async function consumePendingInviteCode(
  bind: (code: string) => Promise<void>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const code = readPendingInviteCode()
  if (!code) return { ok: true }
  try {
    await bind(code)
    writePendingInviteCode(null)
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : '邀请码绑定失败'
    if (message.includes('仅可被邀请一次') || message.includes('已使用过')) {
      writePendingInviteCode(null)
    }
    return { ok: false, message }
  }
}
