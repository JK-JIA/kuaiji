/**
 * 每日生成一条兑换码（UTC 自然日有效）。由 docker-compose 中 redeem-daily 服务循环执行。
 * 查看：docker compose logs redeem-daily 或 docker exec 读 /tmp/kuaiji-daily-code.txt
 */
import { randomBytes } from 'crypto'
import { PrismaClient } from '@prisma/client'
import { appendFileSync } from 'fs'

const prisma = new PrismaClient()

async function main() {
  const code = randomBytes(5).toString('hex').toUpperCase()
  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 1)

  await prisma.redeemCode.create({
    data: {
      code,
      validFrom: start,
      validTo: end,
      maxUses: 5000,
      grantedDays: 30,
      batchId: `daily-${start.toISOString().slice(0, 10)}`,
    },
  })

  const msg = `[redeem-daily] code=${code} validUTC ${start.toISOString()} .. ${end.toISOString()}`
  console.log(msg)
  try {
    appendFileSync('/tmp/kuaiji-daily-code.txt', `${new Date().toISOString()} ${code}\n`)
  } catch {
    /* 无写权限时忽略 */
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
