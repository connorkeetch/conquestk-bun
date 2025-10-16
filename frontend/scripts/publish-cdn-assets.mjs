#!/usr/bin/env node
// Upload hashed og.png and PWA screenshots to CDN (R2/S3) and rewrite HTML/manifest URLs to CDN

import fs from 'node:fs'
import path from 'node:path'

const pubDir = path.resolve(process.cwd(), 'public')
const indexHtmlPath = path.resolve(process.cwd(), 'index.html')
const manifestPath = path.join(pubDir, 'manifest.json')

const endpoint = process.env.ASSET_ENDPOINT?.trim()
const bucket = process.env.ASSET_BUCKET?.trim()
const accessKeyId = process.env.ASSET_ACCESS_KEY_ID?.trim()
const secretAccessKey = process.env.ASSET_SECRET_ACCESS_KEY?.trim()
const publicBase = process.env.PUBLIC_ASSET_BASE_URL?.trim()?.replace(/\/$/, '')

function log(msg) {
  process.stdout.write(`[publish-cdn] ${msg}\n`)
}

function fail(msg) {
  process.stderr.write(`[publish-cdn] ${msg}\n`)
}

function shouldRun() {
  return Boolean(endpoint && bucket && accessKeyId && secretAccessKey && publicBase)
}

function findFiles() {
  const out = []
  // og.<hash>.png at public root
  const og = fs.readdirSync(pubDir).find((f) => /^og\.[a-f0-9]{8,}\.png$/.test(f))
  if (og) out.push({ abs: path.join(pubDir, og), rel: og, key: `static/og/${og}` })
  // screenshots/*.hash.png
  const shotsDir = path.join(pubDir, 'screenshots')
  if (fs.existsSync(shotsDir)) {
    for (const f of fs.readdirSync(shotsDir)) {
      if (/\.[a-f0-9]{8,}\.png$/.test(f)) {
        out.push({
          abs: path.join(shotsDir, f),
          rel: `screenshots/${f}`,
          key: `static/screenshots/${f}`,
        })
      }
    }
  }
  return out
}

async function uploadAll(files) {
  let s3
  try {
    const { S3Client, PutObjectCommand, HeadObjectCommand } = await import('@aws-sdk/client-s3')
    s3 = new S3Client({
      region: 'auto',
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    })

    const exists = async (Key) => {
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key }))
        return true
      } catch {
        return false
      }
    }

    for (const f of files) {
      const Key = f.key
      if (await exists(Key)) {
        log(`skip exists: ${Key}`)
        continue
      }
      const Body = fs.readFileSync(f.abs)
      const ContentType = f.abs.endsWith('.png') ? 'image/png' : 'image/svg+xml'
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key,
          Body,
          ContentType,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      )
      log(`uploaded: ${Key}`)
    }
  } catch (e) {
    fail(`AWS SDK not available or upload failed: ${e?.message || e}`)
    return false
  }
  return true
}

function rewriteRefs(files) {
  const replace = new Map()
  for (const f of files) {
    replace.set(`/${f.rel}`, `${publicBase}/${f.key}`)
  }
  const rewrite = (filePath) => {
    if (!fs.existsSync(filePath)) return
    let txt = fs.readFileSync(filePath, 'utf8')
    for (const [from, to] of replace.entries()) {
      const re = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
      txt = txt.replace(re, to)
    }
    fs.writeFileSync(filePath, txt, 'utf8')
  }
  rewrite(indexHtmlPath)
  rewrite(manifestPath)
  log(`rewrote ${replace.size} reference(s) to CDN`)
}

async function main() {
  if (!shouldRun()) {
    log('Missing ASSET_* or PUBLIC_ASSET_BASE_URL; skipping CDN publish.')
    return
  }
  const files = findFiles()
  if (!files.length) {
    log('No hashed og.png or screenshots found; skipping.')
    return
  }
  const ok = await uploadAll(files)
  if (ok) rewriteRefs(files)
}

main().catch((e) => fail(String(e)))

