#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(process.cwd())
const svgPath = path.join(root, 'frontend/public/icon.svg')
const out512 = path.join(root, 'frontend/public/icon-512.png')
const out180 = path.join(root, 'frontend/public/apple-touch-icon-180.png')

async function run() {
  if (!fs.existsSync(svgPath)) {
    console.error('icon.svg not found at', svgPath)
    process.exit(1)
  }
  const svg = fs.readFileSync(svgPath)
  await sharp(svg)
    .resize(512, 512, { fit: 'contain', background: { r: 17, g: 24, b: 39, alpha: 1 } })
    .png()
    .toFile(out512)
  await sharp(svg)
    .resize(180, 180, { fit: 'contain', background: { r: 17, g: 24, b: 39, alpha: 1 } })
    .png()
    .toFile(out180)
  console.log('Generated', out512, 'and', out180)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
