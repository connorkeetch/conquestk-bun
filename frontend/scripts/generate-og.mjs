#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const pub = path.resolve(process.cwd(), 'public')
const brandSvgPath = path.join(pub, 'conquest_k_logo.svg')
const outPath = path.join(pub, 'og.png')

const W = 1200
const H = 630

function backgroundSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="#0b1220" />
        <stop offset="100%" stop-color="#142a66" />
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#000" flood-opacity="0.45" />
      </filter>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>

    <!-- Glass panel for title -->
    <g filter="url(#shadow)">
      <rect x="56" y="56" rx="20" width="${W - 112}" height="${H - 112}" fill="#0d1726" opacity="0.9" stroke="#1f2a44" stroke-opacity="0.5" />
    </g>

    <text x="${56 + 330}" y="${56 + 140}" fill="#dbeafe" font-family="system-ui, -apple-system, Segoe UI, Roboto" font-weight="800" font-size="72">Conquest K</text>
    <text x="${56 + 330}" y="${56 + 200}" fill="#93c5fd" font-family="system-ui, -apple-system, Segoe UI, Roboto" font-weight="500" font-size="32">Strategic multiplayer conquest</text>
  </svg>`
}

async function main() {
  if (!fs.existsSync(brandSvgPath)) {
    process.exit(1)
  }

  // Render background
  const bgBuf = await sharp(Buffer.from(backgroundSvg())).png().toBuffer()

  // Render brand artwork and fit into a square left panel
  const logoSize = 260
  const logoBuf = await sharp(fs.readFileSync(brandSvgPath))
    .resize(logoSize, logoSize, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer()

  await sharp(bgBuf)
    .composite([{ input: logoBuf, left: 56 + 40, top: 56 + 60 }])
    .png()
    .toFile(outPath)

  process.stdout.write(`✔ OG image → ${outPath}\n`)
}

main().catch((_e) => {
  process.exit(1)
})
