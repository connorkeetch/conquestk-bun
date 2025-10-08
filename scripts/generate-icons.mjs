#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(process.cwd())
// Use the raw brand artwork and wrap it with an inline glow + crop in SVG
const brandSvgPath = path.join(root, 'frontend/public/Conquest_K_Logo.svg')
const out512 = path.join(root, 'frontend/public/icon-512.png')
const out192 = path.join(root, 'frontend/public/icon-192.png')
const out180 = path.join(root, 'frontend/public/apple-touch-icon-180.png')

async function run() {
  if (!fs.existsSync(brandSvgPath)) {
    process.stderr.write(`Brand svg not found at ${brandSvgPath}\n`)
    process.exit(1)
  }
  const brandB64 = Buffer.from(fs.readFileSync(brandSvgPath)).toString('base64')
  const mkSquare = async (size, out) => {
    const scaled = Math.round(size * 1.25)
    const x = -Math.round((scaled - size) / 2)
    const y = 0
    const wrapper = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="0" stdDeviation="${(size * 0.035).toFixed(2)}" flood-color="#cbd5e1" flood-opacity="0.9" />
    </filter>
  </defs>
  <g filter="url(#glow)">
    <image href="data:image/svg+xml;base64,${brandB64}" x="${x}" y="${y}" width="${scaled}" height="${scaled}" preserveAspectRatio="xMidYMid slice" />
  </g>
</svg>`
    await sharp(Buffer.from(wrapper)).png().toFile(out)
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
