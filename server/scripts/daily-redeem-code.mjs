/**
 * 每日生成 5 条兑换码（7天 / 30天 / 半年 / 1年 / 永久），UTC 自然日有效。
 * 由 docker-compose 中 redeem-daily 服务循环执行。
 * 输出：覆盖写入 REDEEM_CODES_OUTPUT_PATH（默认见下方）；Compose 挂载到宿主机目录。
 */
import { randomBytes } from 'crypto'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'

const __dirname = dirname(fileURLToPath(import.meta.url))

const TIERS = [
  { label: '7天', suffix: '7d', grantedDays: 7, grantLifetime: false },
  { label: '30天', suffix: '30d', grantedDays: 30, grantLifetime: false },
  { label: '半年', suffix: 'half', grantedDays: 183, grantLifetime: false },
  { label: '1年', suffix: '1y', grantedDays: 365, grantLifetime: false },
  { label: '永久', suffix: 'life', grantedDays: 0, grantLifetime: true },
]

const prisma = new PrismaClient()

const defaultOutPath = join(
  __dirname,
  '..',
  'data',
  'redeem-codes',
  'redeem-codes.txt',
)

async function main() {
  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 1)
  const dateStr = start.toISOString().slice(0, 10)
  const batchPrefix = `daily-${dateStr}`

  await prisma.redeemCode.deleteMany({
    where: { batchId: { startsWith: batchPrefix } },
  })

  const lines = [
    `# kuaiji 会员兑换码（UTC 当日有效，次日 0 点起失效）`,
    `# 生成时间(ISO): ${new Date().toISOString()}`,
    `# 兑换窗口(UTC): ${start.toISOString()} .. ${end.toISOString()}`,
    `#`,
  ]

  for (const tier of TIERS) {
    const code = randomBytes(5).toString('hex').toUpperCase()
    const batchId = `${batchPrefix}-${tier.suffix}`

    await prisma.redeemCode.create({
      data: {
        code,
        validFrom: start,
        validTo: end,
        maxUses: 5000,
        grantedDays: tier.grantedDays,
        grantLifetime: tier.grantLifetime,
        batchId,
      },
    })

    const desc = tier.grantLifetime ? '永久' : `${tier.grantedDays}天`
    lines.push(`${tier.label}（${desc}）: ${code}`)
    console.log(
      `[redeem-daily] ${tier.label} code=${code} batch=${batchId} validUTC ${start.toISOString()} .. ${end.toISOString()}`,
    )
  }

  const outPath = process.env.REDEEM_CODES_OUTPUT_PATH || defaultOutPath
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8')
  console.log(`[redeem-daily] wrote ${outPath}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
