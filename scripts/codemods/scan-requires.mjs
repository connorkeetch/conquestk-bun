#!/usr/bin/env node
/**
 * scan-requires.mjs
 *
 * Scan for CommonJS require(...) usage in a directory tree, grouped by kind
 * (core module, package, local file), to help plan ESM conversion.
 *
 * Usage:
 *   node scripts/codemods/scan-requires.mjs --target backend/src
 */
import fs from 'node:fs'
import path from 'node:path'

const getArg = (name, fallback) => {
  const idx = process.argv.indexOf(name)
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1]
  return fallback
}

const TARGET = path.resolve(process.cwd(), getArg('--target', 'backend/src'))
if (!fs.existsSync(TARGET)) {
  console.error(`Target not found: ${TARGET}`)
  process.exit(2)
}

const CORE = new Set([
  'node:fs',
  'node:path',
  'node:crypto',
  'node:child_process',
  'node:stream',
  'node:os',
  'node:http',
  'node:https',
  'fs',
  'path',
  'crypto',
  'child_process',
  'http',
  'https',
  'os',
])

const reRequire = /require\(\s*['"]([^'"\n]+)['"]\s*\)/g

const buckets = {
  core: new Map(),
  package: new Map(),
  local: new Map(),
}

function record(kind, file, spec) {
  const map = buckets[kind]
  if (!map.has(spec)) map.set(spec, [])
  map.get(spec).push(path.relative(process.cwd(), file))
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'dist') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (p.endsWith('.ts') || p.endsWith('.js')) {
      const src = fs.readFileSync(p, 'utf8')
      let m
      while ((m = reRequire.exec(src))) {
        const spec = m[1]
        if (spec.startsWith('./') || spec.startsWith('../')) record('local', p, spec)
        else if (CORE.has(spec)) record('core', p, spec)
        else record('package', p, spec)
      }
    }
  }
}

walk(TARGET)

for (const kind of ['core', 'package', 'local']) {
  const map = buckets[kind]
  if (map.size === 0) continue
  console.log(`\n[${kind}]`)
  for (const [spec, files] of map) {
    console.log(`  ${spec}`)
    for (const f of files) console.log(`    - ${f}`)
  }
}

if (buckets.core.size + buckets.package.size + buckets.local.size === 0) {
  console.log('No require(...) usages found')
}

