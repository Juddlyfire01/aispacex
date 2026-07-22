import fs from 'node:fs'
import path from 'node:path'
import { loadEnv, type ConfigEnv } from 'vite'

/**
 * Vite's loadEnv lets existing `process.env.VITE_*` override `.env` files.
 * Stale shell / `vercel env pull` values (e.g. DISABLE_FREE=false) then win
 * over the developer's local `.env` and the client never sees the intended flag.
 *
 * Re-apply file values for VITE_* so local `.env` / `.env.local` win.
 */
export function loadEnvPreferringDotenv(
  mode: ConfigEnv['mode'],
  envDir: string = process.cwd(),
): Record<string, string> {
  const env = loadEnv(mode, envDir, '')
  const files = ['.env', `.env.${mode}`, '.env.local', `.env.${mode}.local`]
  for (const file of files) {
    const full = path.join(envDir, file)
    if (!fs.existsSync(full)) continue
    const parsed = parseEnvFile(fs.readFileSync(full, 'utf8'))
    for (const [key, value] of Object.entries(parsed)) {
      if (!key.startsWith('VITE_')) continue
      if (!value) continue
      env[key] = value
      process.env[key] = value
    }
  }
  return env
}

/** Minimal KEY=VAL parser (no export expansion). Mirrors dotenv's common cases. */
export function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}
