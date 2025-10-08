#!/usr/bin/env node
// Generates maskable icons and install screenshots from the base SVG icon.
// Requires: sharp (already in frontend devDependencies)

import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const _root = path.resolve(process.cwd(), '..') // start from frontend/, go to repo root, then back to frontend/public
const pub = path.resolve(process.cwd(), 'public')

// Use the CROPPED brand artwork as the base
const BRAND_SVG = path.join(pub, 'Conquest_K_Logo-cropped.svg')
const ICON_OUTS = [
  { file: 'icon-192-maskable.png', size: 192 },
  { file: 'icon-512-maskable.png', size: 512 },
]

const SCREEN_DIR = path.join(pub, 'screenshots')
const SCREENS = [
  { file: 'mobile-1080x1920.png', w: 1080, h: 1920, label: 'narrow' },
  { file: 'wide-1920x1080.png', w: 1920, h: 1080, label: 'wide' },
]

function svgBackdrop({ w, h }) {
  const pad = Math.round(Math.min(w, h) * 0.08)
  const radius = Math.round(pad * 0.7)
  const titleSize = Math.round(h * 0.05)
  const subtitleSize = Math.round(h * 0.03)
  const logoSize = Math.round(Math.min(w, h) * 0.28)
  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="#0b1220" />
        <stop offset="100%" stop-color="#142a66" />
      </linearGradient>
      <linearGradient id="panel" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="#111827" />
        <stop offset="100%" stop-color="#0b1220" />
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="4" stdDeviation="10" flood-color="#000" flood-opacity="0.4"/>
      </filter>
    </defs>
    <rect x="0" y="0" width="${w}" height="${h}" fill="url(#bg)"/>
    <g filter="url(#shadow)">
      <rect x="${pad}" y="${pad}" rx="${radius}" ry="${radius}" width="${w - pad * 2}" height="${h - pad * 2}" fill="url(#panel)" stroke="#293f7a" stroke-opacity="0.4" />
    </g>
    <text x="${pad * 1.3}" y="${pad * 2}" fill="#dbeafe" font-family="system-ui, -apple-system, Segoe UI, Roboto" font-weight="700" font-size="${titleSize}">Conquest K</text>
    <text x="${pad * 1.3}" y="${pad * 2 + subtitleSize * 1.6}" fill="#93c5fd" font-family="system-ui, -apple-system, Segoe UI, Roboto" font-size="${subtitleSize}">Strategic multiplayer conquest</text>
    <rect x="${pad * 1.3}" y="${pad * 3}" width="${w - pad * 2.6}" height="${Math.round(h * 0.58)}" fill="#0d1726" stroke="#1f2a44" stroke-opacity="0.6" rx="${Math.round(radius * 0.6)}"/>
    <circle cx="${Math.round(w * 0.2)}" cy="${Math.round(h * 0.58)}" r="${Math.round(logoSize * 0.65)}" fill="#0b1220" stroke="#1f2a44" />
    <rect x="${Math.round(w * 0.35)}" y="${Math.round(h * 0.5)}" width="${Math.round(w * 0.45)}" height="${Math.round(h * 0.14)}" rx="${Math.round(radius * 0.5)}" fill="#0b1220" stroke="#1f2a44" />
    <rect x="${Math.round(w * 0.35)}" y="${Math.round(h * 0.67)}" width="${Math.round(w * 0.35)}" height="${Math.round(h * 0.08)}" rx="${Math.round(radius * 0.5)}" fill="#142a66" />
  </svg>`
}

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true })
}

async function generateMaskables() {
  if (!fs.existsSync(BRAND_SVG)) throw new Error(`Missing base SVG at ${BRAND_SVG}`)
  const brandB64 = Buffer.from(await fs.promises.readFile(BRAND_SVG)).toString('base64')
  for (const { file, size } of ICON_OUTS) {
    const outPath = path.join(pub, file)
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
    await sharp(Buffer.from(wrapper)).png().toFile(outPath)
    process.stdout.write(`✔ maskable ${size} → ${outPath}\n`)
  }
}

async function generateScreens() {
  await ensureDir(SCREEN_DIR)
  for (const s of SCREENS) {
    const svg = svgBackdrop({ w: s.w, h: s.h })
    const outPath = path.join(SCREEN_DIR, s.file)
    await sharp(Buffer.from(svg)).png().toFile(outPath)
    process.stdout.write(`✔ screenshot ${s.label} ${s.w}x${s.h} → ${outPath}\n`)
  }
}

async function main() {
  await generateMaskables()
  await generateScreens()
  process.stdout.write('All PWA assets generated.\n')
}

main().catch((_e) => {
  process.exit(1)
})
