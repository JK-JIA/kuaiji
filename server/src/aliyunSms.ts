/**
 * 阿里云号码认证 - SendSmsVerifyCode / CheckSmsVerifyCode
 * https://help.aliyun.com/zh/pnvs/developer-reference/api-dypnsapi-2017-05-25-sendsmsverifycode
 * createRequire：ESM+NodeNext 下该 CJS 包默认导入类型不可构造。
 */
import { createRequire } from 'node:module'
import {
  CheckSmsVerifyCodeRequest,
  SendSmsVerifyCodeRequest,
} from '@alicloud/dypnsapi20170525'
import { $OpenApiUtil } from '@alicloud/openapi-core'

const require = createRequire(import.meta.url)

type DypnsSmsClient = {
  sendSmsVerifyCode(
    req: SendSmsVerifyCodeRequest,
  ): Promise<{
    body?: {
      success?: boolean
      code?: string
      message?: string
      requestId?: string
      model?: Record<string, unknown>
    }
  }>
  checkSmsVerifyCode(
    req: CheckSmsVerifyCodeRequest,
  ): Promise<{
    body?: {
      success?: boolean
      code?: string
      model?: { verifyResult?: string }
    }
  }>
}

const DypnsCtor = require('@alicloud/dypnsapi20170525')
  .default as new (config: $OpenApiUtil.Config) => DypnsSmsClient

export function aliyunSmsConfigured(): boolean {
  return Boolean(
    process.env.ALIYUN_ACCESS_KEY_ID?.trim() &&
      process.env.ALIYUN_ACCESS_KEY_SECRET?.trim(),
  )
}

function createClient(): DypnsSmsClient {
  const config = new $OpenApiUtil.Config({
    accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
    regionId: process.env.ALIYUN_REGION_ID?.trim() || 'cn-hangzhou',
  })
  return new DypnsCtor(config)
}

/** 号码认证-短信认证：赠送签名「云渚科技验证服务」+ 登录/注册模板 100001；可用环境变量覆盖 */
const DEFAULT_SIGN = '云渚科技验证服务'
const DEFAULT_TEMPLATE = '100001'

function maskPhone11(phone: string): string {
  if (phone.length !== 11) return '***'
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`
}

export async function sendAliyunSmsVerifyCode(phone11: string): Promise<void> {
  const client = createClient()
  const signName =
    process.env.ALIYUN_SMS_SIGN_NAME?.trim() || DEFAULT_SIGN
  const templateCode =
    process.env.ALIYUN_SMS_TEMPLATE_CODE?.trim() || DEFAULT_TEMPLATE
  const min = process.env.ALIYUN_SMS_TEMPLATE_MIN?.trim() || '5'

  const req = new SendSmsVerifyCodeRequest({
    phoneNumber: phone11,
    countryCode: '86',
    signName,
    templateCode,
    templateParam: JSON.stringify({ code: '##code##', min }),
    codeType: 1,
    codeLength: 6,
    validTime: 300,
    interval: 60,
    duplicatePolicy: 1,
    returnVerifyCode: false,
  })

  let resp
  try {
    resp = await client.sendSmsVerifyCode(req)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`短信发送失败：${msg}`)
  }

  const body = resp.body
  if (!body?.success || body.code !== 'OK') {
    const apiMsg = [body?.code, body?.message].filter(Boolean).join(' — ')
    console.error('[sms:aliyun] API business error', {
      phone: maskPhone11(phone11),
      signName,
      templateCode,
      requestId: body?.requestId,
      code: body?.code,
      message: body?.message,
    })
    const hint =
      '请到阿里云控制台「号码认证 → 短信认证」查看当前账号可用的签名与模板编号，并在环境变量中设置 ALIYUN_SMS_SIGN_NAME、ALIYUN_SMS_TEMPLATE_CODE（需与控制台一致）；仅配置 AccessKey 不够。'
    throw new Error(apiMsg ? `${apiMsg}。${hint}` : hint)
  }

  console.log(
    '[sms:aliyun] SendSmsVerifyCode OK',
    JSON.stringify({
      phone: maskPhone11(phone11),
      signName,
      templateCode,
      requestId: body.requestId,
      model: body.model,
    }),
  )
}

export async function verifyAliyunSmsCode(
  phone11: string,
  code: string,
): Promise<boolean> {
  const client = createClient()
  const req = new CheckSmsVerifyCodeRequest({
    phoneNumber: phone11,
    countryCode: '86',
    verifyCode: code.trim(),
    caseAuthPolicy: 1,
  })

  let resp
  try {
    resp = await client.checkSmsVerifyCode(req)
  } catch {
    return false
  }

  const body = resp.body
  if (!body?.success || body.code !== 'OK') {
    return false
  }
  return body.model?.verifyResult === 'PASS'
}
