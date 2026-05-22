/**
 * 阿里云号码认证 - GetMobile（一键登录取号）
 * https://help.aliyun.com/zh/pnvs/developer-reference/api-dypnsapi-2017-05-25-getmobile
 */
import { createRequire } from 'node:module'
import { GetMobileRequest } from '@alicloud/dypnsapi20170525'
import { $OpenApiUtil } from '@alicloud/openapi-core'
import { aliyunSmsConfigured } from './aliyunSms.js'

const require = createRequire(import.meta.url)

type DypnsClient = {
  getMobile(
    req: GetMobileRequest,
  ): Promise<{
    body?: {
      code?: string
      message?: string
      requestId?: string
      getMobileResultDTO?: { mobile?: string }
    }
  }>
}

const DypnsCtor = require('@alicloud/dypnsapi20170525')
  .default as new (config: $OpenApiUtil.Config) => DypnsClient

export function aliyunOneClickConfigured(): boolean {
  return aliyunSmsConfigured()
}

function createClient(): DypnsClient {
  const config = new $OpenApiUtil.Config({
    accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
    regionId: process.env.ALIYUN_REGION_ID?.trim() || 'cn-hangzhou',
  })
  return new DypnsCtor(config)
}

export async function getPhoneFromAccessToken(
  accessToken: string,
): Promise<string> {
  const client = createClient()
  const req = new GetMobileRequest({ accessToken: accessToken.trim() })

  let resp
  try {
    resp = await client.getMobile(req)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`取号失败：${msg}`)
  }

  const body = resp.body
  if (!body || body.code !== 'OK') {
    const apiMsg = [body?.code, body?.message].filter(Boolean).join(' — ')
    throw new Error(apiMsg || 'GetMobile 失败，请检查号码认证方案与 AccessKey')
  }

  const mobile = body.getMobileResultDTO?.mobile?.trim() ?? ''
  if (!/^1\d{10}$/.test(mobile)) {
    throw new Error('取号结果无效')
  }
  return mobile
}
