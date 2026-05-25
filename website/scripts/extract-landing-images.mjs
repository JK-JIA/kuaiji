import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const src = process.argv[2] || 'C:/Users/admin/Desktop/kuaiji-landing.html'
const outDir =
  process.argv[3] ||
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/assets/screens')

const html = fs.readFileSync(src, 'utf8')
const names = [
  'hero-stats.jpg',
  'hero-home.jpg',
  'hero-reconcile.jpg',
  'gallery-home.jpg',
  'gallery-stats.jpg',
  'gallery-products.jpg',
  'gallery-buyers.jpg',
  'gallery-settings.jpg',
]

const re = /data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/g
let i = 0
let m
fs.mkdirSync(outDir, { recursive: true })
while ((m = re.exec(html))) {
  const name = names[i] || `screen-${i + 1}.jpg`
  const buf = Buffer.from(m[1], 'base64')
  fs.writeFileSync(path.join(outDir, name), buf)
  console.log(name, buf.length)
  i++
}
console.log('total', i)
