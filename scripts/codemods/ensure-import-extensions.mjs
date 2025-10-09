#!/usr/bin/env node
/**
 * ensure-import-extensions.mjs
 *
 * Stage 1 ESM prep: scan (and optionally apply) explicit ".js" extensions
 * to relative import specifiers in TypeScript source files.
 *
 * Usage:
 *   node scripts/codemods/ensure-import-extensions.mjs --target backend/src [--apply]
 */

import fs from 'node:fs'
import path from 'node:path'

const args = new Set(process.argv.slice(2))
const getArg = (name, fallback) => {
  const idx = process.argv.indexOf(name)
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1]
  return fallback
}

const ROOT = process.cwd()
const TARGET = path.resolve(ROOT, getArg('--target', 'backend/src'))
const APPLY = args.has('--apply')

const isTsSource = (p) => p.endsWith('.ts') && !p.endsWith('.d.ts')

/**
 * Basic regex-based rewriter for import specifiers. This intentionally avoids
 * a heavy AST dependency for quick scans and small diffs.
 */
function rewriteSpecifiers(source, relFile) {
  const changes = []

  const replace = (match, spec, offset, full, kind) => {
    // Only rewrite relative specifiers
    if (!spec.startsWith('./') && !spec.startsWith('../')) return match
    // Ignore explicit extensions that are valid in Node
    if (/(\.js|\.json|\.node|\.wasm)$/i.test(spec)) return match
    // Normalize index imports: "./foo/index" -> "./foo/index.js"
    // Replace .ts/.tsx if any
    let next = spec.replace(/\.(ts|tsx)$/i, '')
    next = `${next}.js`
    if (next !== spec) {
      changes.push({ from: spec, to: next })
      return match.replace(spec, next)
    }
    return match
  }

  let updated = source

  // Static import/export with from
  updated = updated.replace(/(import|export)\s+[^'"\n]*?from\s+['"]([^'"\n]+)['"]/g, (m, _kw, spec, off) =>
    replace(m, spec, off, source, 'static'),
  )

  // Bare imports: import '...'
  updated = updated.replace(/import\s+['"]([^'"\n]+)['"]/g, (m, spec, off) =>
    replace(m, spec, off, source, 'bare'),
  )

  // Dynamic imports: import('...')
  updated = updated.replace(/import\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g, (m, spec, off) =>
    replace(m, spec, off, source, 'dynamic'),
  )

  return { updated, changes }
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.cache') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (isTsSource(p)) files.push(p)
  }
}

const files = []
if (!fs.existsSync(TARGET)) {
  console.error(`Target not found: ${TARGET}`)
  process.exit(2)
}
walk(TARGET)

let touched = 0
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  const { updated, changes } = rewriteSpecifiers(src, path.relative(ROOT, file))
  if (changes.length > 0) {
    touched++
    if (APPLY) {
      fs.writeFileSync(file, updated, 'utf8')
    }
    console.log(`${APPLY ? 'UPDATE' : 'CHECK'} ${path.relative(ROOT, file)}`)
    for (const c of changes) console.log(`  ${c.from} -> ${c.to}`)
  }
}

if (touched === 0) {
  console.log('No import specifier updates needed')
}

