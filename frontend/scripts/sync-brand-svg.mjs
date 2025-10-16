#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const srcPath = path.join(root, 'public', 'conquest_k_logo.svg')
const destDir = path.join(root, 'src', 'assets', 'brand')
const destPath = path.join(destDir, 'conquest_k_logo.svg')

async function main() {
  await fs.promises.mkdir(destDir, { recursive: true })
  const svg = await fs.promises.readFile(srcPath)
  await fs.promises.writeFile(destPath, svg)
  process.stdout.write(`[sync-brand-svg] copied ${srcPath} -> ${destPath}\n`)
}

main().catch((e) => {
  console.error('[sync-brand-svg] failed:', e)
  process.exit(1)
})

