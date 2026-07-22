import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadEnvPreferringDotenv, parseEnvFile } from './load-env-prefer-dotenv'

describe('parseEnvFile', () => {
  it('parses keys, ignores comments, strips quotes', () => {
    const parsed = parseEnvFile(`
# comment
VITE_X402_DISABLE_FREE=true
VITE_X402_MARGIN="2.0"
OTHER=1
`)
    expect(parsed.VITE_X402_DISABLE_FREE).toBe('true')
    expect(parsed.VITE_X402_MARGIN).toBe('2.0')
    expect(parsed.OTHER).toBe('1')
  })
})

describe('loadEnvPreferringDotenv', () => {
  it('lets .env VITE_* win over a stale process.env value', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aispacex-env-'))
    try {
      fs.writeFileSync(
        path.join(dir, '.env'),
        'VITE_X402_DISABLE_FREE=true\nVITE_X402_ENABLED=true\nVITE_X402_MARGIN=2.0\n',
        'utf8',
      )
      process.env.VITE_X402_DISABLE_FREE = 'false'
      process.env.VITE_X402_MARGIN = '1.3'

      const env = loadEnvPreferringDotenv('development', dir)

      expect(env.VITE_X402_DISABLE_FREE).toBe('true')
      expect(env.VITE_X402_MARGIN).toBe('2.0')
      expect(process.env.VITE_X402_DISABLE_FREE).toBe('true')
      expect(process.env.VITE_X402_MARGIN).toBe('2.0')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      delete process.env.VITE_X402_DISABLE_FREE
      delete process.env.VITE_X402_MARGIN
    }
  })
})
