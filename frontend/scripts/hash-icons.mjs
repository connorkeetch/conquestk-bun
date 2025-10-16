#!/usr/bin/env node
// Hash key PWA/favicon images in public and rewrite index.html + manifest.json

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const pub = path.resolve(process.cwd(), 'public')
const indexHtmlPath = path.resolve(process.cwd(), 'index.html')
const manifestPath = path.join(pub, 'manifest.json')

const TARGETS = [
  'favicon-16x16.png',
  'favicon-32x32.png',
  'apple-touch-icon-180.png',
  'icon-192.png',
  'icon-512.png',
  'icon-192-maskable.png',
  'icon-512-maskable.png',
  'og.png',
  'safari-pinned-tab.svg',
  'screenshots/mobile-1080x1920.png',
  'screenshots/wide-1920x1080.png',
]

function hashOf(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10)
}

function withHash(name, hash) {
  const i = name.lastIndexOf('.')
  if (i < 0) return `${name}.${hash}`
  return `${name.slice(0, i)}.${hash}${name.slice(i)}`
}

function rewriteFile(filePath, replaceMap) {
  let txt = fs.readFileSync(filePath, 'utf8')
  for (const [from, to] of replaceMap.entries()) {
    const safeFrom = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(safeFrom, 'g')
    txt = txt.replace(re, to)
  }
  fs.writeFileSync(filePath, txt, 'utf8')
}

async function run() {
  const replace = new Map()

  for (const rel of TARGETS) {
    const p = path.join(pub, rel)
    if (!fs.existsSync(p)) continue
    const buf = fs.readFileSync(p)
    const h = hashOf(buf)
    const hashed = withHash(rel, h)
    const out = path.join(pub, hashed)
    if (!fs.existsSync(out)) fs.copyFileSync(p, out)
    replace.set(`/${rel}`, `/${hashed}`)
  }

  if (fs.existsSync(indexHtmlPath)) rewriteFile(indexHtmlPath, replace)
  if (fs.existsSync(manifestPath)) rewriteFile(manifestPath, replace)

  process.stdout.write(`[hash-icons] Updated ${replace.size} asset references.\n`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
