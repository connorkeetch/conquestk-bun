/**
 * Run each backend test file in its OWN `bun test` process.
 *
 * Why: `bun test` runs every file in a single process with a shared module
 * registry, and module mocks (`jest.mock` / `mock.module`) are global — they
 * leak across files (a mock of `../services/foo` in one file replaces it for
 * every other file). Jest isolated the module registry per file; bun does not.
 * Running one file per process restores that isolation without rewriting the
 * suite's mocking. See the CI notes in AGENTS.md / CLAUDE.md.
 *
 * Usage: bun run scripts/run-tests-isolated.ts [extra bun-test args...]
 * Exits non-zero if any file fails.
 */
const extraArgs = process.argv.slice(2)

const glob = new Bun.Glob('**/*.{test,spec}.ts')
const files = Array.from(glob.scanSync({ cwd: 'src' }))
  .map((f) => `src/${f.replaceAll('\\', '/')}`)
  .sort()

if (files.length === 0) {
  console.error('No test files found under src/.')
  process.exit(1)
}

console.log(`Running ${files.length} test file(s) in isolated processes...\n`)

const failed: string[] = []
for (const file of files) {
  const proc = Bun.spawnSync(['bun', 'test', ...extraArgs, file], {
    stdout: 'inherit',
    stderr: 'inherit',
  })
  if (proc.exitCode !== 0) {
    failed.push(file)
  }
}

console.log(`\n${'='.repeat(60)}`)
console.log(`Isolated run: ${files.length - failed.length}/${files.length} files passed`)
if (failed.length > 0) {
  console.log('Failed files:')
  for (const f of failed) {
    console.log(`  - ${f}`)
  }
  process.exit(1)
}
console.log('All test files passed.')
