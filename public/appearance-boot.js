/**
 * Pre-React FOUC guard. Runs as a blocking classic script (allowed by CSP
 * script-src 'self'). Reads the plaintext appearance mirror written by the app
 * whenever theme/scale prefs change. Does NOT attempt to decrypt venice-settings.
 */
;(function () {
  try {
    var html = document.documentElement
    var theme = 'dark'
    var raw = null
    try {
      raw = localStorage.getItem('aispacex-appearance')
    } catch (_) {
      /* private mode */
    }

    // Keep in sync with TYPEFACE_STACKS in src/lib/appearance.ts
    var TYPEFACES = {
      aispace: {
        sans: '"Space Grotesk", "Inter", system-ui, sans-serif',
        mono: '"JetBrains Mono", "Cascadia Mono", "SF Mono", Consolas, monospace',
      },
      x: {
        sans: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      },
      cursor: {
        sans: '"Inter", "InterVariable", system-ui, sans-serif',
        mono: '"JetBrains Mono", "Cascadia Mono", "SF Mono", Consolas, monospace',
      },
      venice: {
        sans: '"Inter", "InterVariable", system-ui, sans-serif',
        mono: '"JetBrains Mono", "Cascadia Mono", "SF Mono", Consolas, monospace',
      },
      dossier: {
        sans: '"IBM Plex Sans", "Source Sans 3", system-ui, sans-serif',
        mono: '"IBM Plex Mono", "Courier Prime", "Courier New", Courier, monospace',
      },
    }
    var DEFAULT_TYPEFACE = 'aispace'

    if (raw) {
      var s = JSON.parse(raw)
      if (s && s.theme) theme = s.theme
      html.dataset.theme = theme
      html.style.colorScheme = theme === 'light' ? 'light' : 'dark'

      var scale = s.scale != null ? s.scale : s.zoom != null ? s.zoom : 100
      html.style.setProperty('--ui-scale', String(Number(scale) / 100 || 1))
      html.style.removeProperty('zoom')

      // Keep in sync with FONT_SCALE_MAP in src/lib/appearance.ts
      var fontScale = { sm: 0.95, md: 1.1, lg: 1.25 }
      var fontKey = s.fontScale && fontScale[s.fontScale] ? s.fontScale : 'md'
      html.style.setProperty('--font-scale', String(fontScale[fontKey]))

      var densitySpace = s.density === 'compact' ? 0.82 : 1
      html.style.setProperty('--density-space', String(densitySpace))
      if (s.density) html.dataset.density = s.density
      if (s.reduceMotion) html.dataset.reduceMotion = String(s.reduceMotion)

      var typefaceKey = s.typeface && TYPEFACES[s.typeface] ? s.typeface : DEFAULT_TYPEFACE
      var stacks = TYPEFACES[typefaceKey]
      html.style.setProperty('--font-sans', stacks.sans)
      html.style.setProperty('--font-mono', stacks.mono)
      html.dataset.typeface = typefaceKey
    } else {
      // First visit or mirror not written yet — leave data-theme from <html>.
      html.dataset.theme = theme
      html.style.colorScheme = 'dark'
      var def = TYPEFACES[DEFAULT_TYPEFACE]
      html.style.setProperty('--font-sans', def.sans)
      html.style.setProperty('--font-mono', def.mono)
      html.dataset.typeface = DEFAULT_TYPEFACE
    }

    if (theme === 'light') {
      var meta = document.querySelector('meta[name="theme-color"]')
      if (meta) meta.setAttribute('content', '#f4f4f2')
    }

    var favicon = document.querySelector('link[rel="icon"]')
    if (favicon) {
      favicon.href = theme === 'light' ? '/aispace-logo-light.svg?v=12' : '/aispace-logo-dark.svg?v=12'
      favicon.type = 'image/svg+xml'
    }
  } catch (_) {
    /* ignore corrupt storage */
  }
})()
