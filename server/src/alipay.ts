import { AlipaySdk } from 'alipay-sdk'

function envTrim(name: string): string {
  return process.env[name]?.trim() ?? ''
}

function normalizePublicKey(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (trimmed.includes('BEGIN')) return trimmed
  const body = trimmed.replace(/\s+/g, '')
  const lines = body.match(/.{1,64}/g) ?? [body]
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`
}

function normalizePrivateKey(raw: string): {
  privateKey: string
  keyType: 'PKCS1' | 'PKCS8'
} {
  const trimmed = raw.trim()
  if (!trimmed) return { privateKey: '', keyType: 'PKCS8' }
  if (trimmed.includes('BEGIN RSA PRIVATE KEY')) {
    return { privateKey: trimmed, keyType: 'PKCS1' }
  }
  if (trimmed.includes('BEGIN PRIVATE KEY')) {
    return { privateKey: trimmed, keyType: 'PKCS8' }
  }
  const body = trimmed.replace(/\s+/g, '')
  const lines = body.match(/.{1,64}/g) ?? [body]
  return {
    privateKey: `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----`,
    keyType: 'PKCS8',
  }
}

export function alipayAppId(): string {
  return envTrim('ALIPAY_APP_ID')
}

export function alipayConfigWarnings(): string[] {
  const warnings: string[] = []
  const appId = alipayAppId()
  const sandbox = alipaySandboxMode()
  if (sandbox && appId && !appId.startsWith('902100')) {
    warnings.push(
      'ALIPAY_SANDBOX=true 但 APP_ID 不是沙箱应用（902100…），请改用沙箱 APPID 9021000164606067 及沙箱系统默认密钥',
    )
  }
  if (!sandbox && appId.startsWith('902100')) {
    warnings.push('ALIPAY_SANDBOX=false 但 APP_ID 为沙箱应用，正式收款需改用正式 APPID')
  }
  return warnings
}

export function alipayEnvReady(): boolean {
  return Boolean(
    envTrim('ALIPAY_APP_ID') &&
      envTrim('ALIPAY_PRIVATE_KEY') &&
      envTrim('ALIPAY_PUBLIC_KEY'),
  )
}

export function alipaySandboxMode(): boolean {
  const v = envTrim('ALIPAY_SANDBOX').toLowerCase()
  if (v === 'true' || v === '1' || v === 'yes') return true
  if (v === 'false' || v === '0' || v === 'no') return false
  const gateway = envTrim('ALIPAY_GATEWAY')
  return gateway.includes('sandbox') || gateway.includes('alipaydev.com')
}

let cachedSdk: AlipaySdk | null = null

export function getAlipaySdk(): AlipaySdk {
  if (cachedSdk) return cachedSdk

  const appId = alipayAppId()
  const { privateKey, keyType } = normalizePrivateKey(
    envTrim('ALIPAY_PRIVATE_KEY'),
  )
  const alipayPublicKey = normalizePublicKey(envTrim('ALIPAY_PUBLIC_KEY'))
  const gateway =
    envTrim('ALIPAY_GATEWAY') ||
    (alipaySandboxMode()
      ? 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'
      : 'https://openapi.alipay.com/gateway.do')

  if (!appId || !privateKey || !alipayPublicKey) {
    throw new Error('ALIPAY_NOT_CONFIGURED')
  }

  cachedSdk = new AlipaySdk({
    appId,
    privateKey,
    alipayPublicKey,
    gateway,
    signType: 'RSA2',
    keyType,
  })
  return cachedSdk
}

export function alipayNotifyUrl(): string {
  return (
    envTrim('ALIPAY_NOTIFY_URL') ||
    'https://kuaijipf.com/api/payment/alipay/notify'
  )
}
