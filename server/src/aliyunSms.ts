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
    body?: { success?: boolean; code?: string; message?: string }
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

/** 与控制台「快速测试」默认一致，可用环境变量覆盖 */
const DEFAULT_SIGN = '阿里云短信测试'
const DEFAULT_TEMPLATE = '100001'

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
    throw new Error(body?.message || body?.code || '短信发送失败')
  }
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
