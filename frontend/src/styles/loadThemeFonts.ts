// Lazy-load display fonts only when the active theme needs them.
// Keeps initial render/lightweight themes fast and avoids blocking LCP.

const loaded = new Set<string>()

async function loadOnce(key: string, loader: () => Promise<unknown>): Promise<void> {
  if (loaded.has(key)) return
  try {
    await loader()
    loaded.add(key)
  } catch {
    // Best-effort only; font loading failure should not break UI
  }
}

export async function loadThemeFonts(themeId: string): Promise<void> {
  // Normalize to base id without light/dark suffix for font choice
  const id = themeId.toLowerCase()

  // Premium/novel themes use decorative heading fonts.
  if (id.startsWith('retrospace')) {
    await loadOnce('audiowide-400', () => import('@fontsource/audiowide/400.css'))
    return
  }
  if (id.startsWith('frontier')) {
    await loadOnce('rye-400', () => import('@fontsource/rye/400.css'))
    return
  }
  if (id.startsWith('metal')) {
    await loadOnce('metal-mania-400', () => import('@fontsource/metal-mania/400.css'))
    // Secondary fallback used in CSS variable stack
    await loadOnce('new-rocker-400', () => import('@fontsource/new-rocker/400.css'))
    return
  }
  if (id.startsWith('halloween')) {
    await loadOnce('creepster-400', () => import('@fontsource/creepster/400.css'))
    return
  }
  if (id.startsWith('cutlers-cheese')) {
    await loadOnce('chewy-400', () => import('@fontsource/chewy/400.css'))
    return
  }

  // Default/dark/light/blue/green/red/black/highcontrast use system/base stack
}
