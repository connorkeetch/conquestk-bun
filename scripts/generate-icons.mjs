#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(process.cwd())
// Use the raw brand artwork to avoid <image> href resolution issues in headless SVG rendering
const svgPath = path.join(root, 'frontend/public/Conquest_K_Logo.svg')
const out512 = path.join(root, 'frontend/public/icon-512.png')
const out192 = path.join(root, 'frontend/public/icon-192.png')
const out180 = path.join(root, 'frontend/public/apple-touch-icon-180.png')

async function run() {
  if (!fs.existsSync(svgPath)) {
    process.stderr.write(`icon.svg not found at ${svgPath}\n`)
    process.exit(1)
  }
  const svg = fs.readFileSync(svgPath)
  const mkSquare = async (size, out) => {
    const logo = await sharp(svg)
      .resize(size, size, { fit: 'cover', position: 'centre' })
      .png()
      .toBuffer()
    await sharp({ create: { width: size, height: size, channels: 4, background: { r: 17, g: 24, b: 39, alpha: 1 } } })
      .composite([{ input: logo }])
      .png()
      .toFile(out)
  }
  await mkSquare(512, out512)
  await mkSquare(192, out192)
  await mkSquare(180, out180)
  process.stdout.write(`Generated ${out512}, ${out192} and ${out180}\n`)
}

run().catch((e) => {
  process.stderr.write(`${String(e)}\n`)
  process.exit(1)
})
