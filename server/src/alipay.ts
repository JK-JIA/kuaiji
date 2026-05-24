import { AlipaySdk } from 'alipay-sdk'

function envTrim(name: string): string {
  return process.env[name]?.trim() ?? ''
}

function normalizePem(raw: string, label: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (trimmed.includes('BEGIN')) return trimmed
  const body = trimmed.replace(/\s+/g, '')
  const lines = body.match(/.{1,64}/g) ?? [body]
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`
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

  const appId = envTrim('ALIPAY_APP_ID')
  const privateKey = normalizePem(envTrim('ALIPAY_PRIVATE_KEY'), 'RSA PRIVATE KEY')
  const alipayPublicKey = normalizePem(envTrim('ALIPAY_PUBLIC_KEY'), 'PUBLIC KEY')
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
    keyType: 'PKCS1',
  })
  return cachedSdk
}

export function alipayNotifyUrl(): string {
  return (
    envTrim('ALIPAY_NOTIFY_URL') ||
    'https://kuaijipf.com/api/payment/alipay/notify'
  )
}
