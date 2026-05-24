import { mkdir, copyFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const source = process.argv[2]
if (!source) {
  console.error('Usage: node scripts/gen-android-icons.mjs <source.png>')
  process.exit(1)
}

const resDir = path.join(root, 'android/app/src/main/res')
const sizes = {
  'mipmap-mdpi': { launcher: 48, foreground: 108 },
  'mipmap-hdpi': { launcher: 72, foreground: 162 },
  'mipmap-xhdpi': { launcher: 96, foreground: 216 },
  'mipmap-xxhdpi': { launcher: 144, foreground: 324 },
  'mipmap-xxxhdpi': { launcher: 192, foreground: 432 },
}

for (const [folder, { launcher, foreground }] of Object.entries(sizes)) {
  const dir = path.join(resDir, folder)
  await mkdir(dir, { recursive: true })
  const launcherPath = path.join(dir, 'ic_launcher.png')
  const roundPath = path.join(dir, 'ic_launcher_round.png')
  const fgPath = path.join(dir, 'ic_launcher_foreground.png')

  await sharp(source).resize(launcher, launcher, { fit: 'cover' }).png().toFile(launcherPath)
  await copyFile(launcherPath, roundPath)
  await sharp(source).resize(foreground, foreground, { fit: 'cover' }).png().toFile(fgPath)
  console.log(`wrote ${folder}`)
}

await mkdir(path.join(root, 'android/app/src/main/assets'), { recursive: true })
await copyFile(source, path.join(root, 'android/app/src/main/assets/icon-source.png'))
console.log('done')
