export type PremiumGateInput = {
  apiBase: string | undefined
  token: string | null
  membershipActive: boolean
}

/**
 * 智能识别、语音识别（走服务端 ASR）、云端账本等需已登录且会员有效。
 * @returns null 表示可用；否则为可直接展示给用户的提示文案
 */
export function messageIfPremiumFeatureBlocked(
  input: PremiumGateInput,
): string | null {
  if (!input.apiBase?.trim()) {
    return '当前未配置服务器地址，无法使用该功能。'
  }
  if (!input.token) {
    return '需要登录才能使用该功能。'
  }
  if (!input.membershipActive) {
    return '需要开通会员才能使用该功能，请前往设置页兑换会员。'
  }
  return null
}
