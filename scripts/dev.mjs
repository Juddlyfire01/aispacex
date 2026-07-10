/**
 * Single-command local stack:
 *   - vercel dev on :3000  → serverless /api (OAuth, X proxy, news, …)
 *   - Vite on :5173        → UI (proxies /api → :3000, same origin as your data)
 *
 * package.json cannot set "dev": "vercel dev" directly — the Vercel CLI treats
 * that as recursive invocation. This wrapper is what `npm run dev` runs.
 */
import { spawn } from 'node:child_process'
import process from 'node:process'

const children = []

function run(name, command, args, color) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      FORCE_COLOR: process.env.FORCE_COLOR ?? '1',
    },
  })
  child.on('error', (err) => {
    console.error(`[${name}] failed to start:`, err.message)
  })
  children.push({ name, child, color })
  return child
}

console.log('[dev] starting API (:3000) + web (:5173)…')
console.log('[dev] open http://localhost:5173')

const api = run('api', 'vercel', ['dev', '--listen', '3000'])
const web = run('web', 'npx', ['vite', '--port', '5173', '--strictPort'])

function shutdown(code = 0) {
  for (const { child } of children) {
    if (!child.killed) {
      try {
        child.kill('SIGTERM')
      } catch {
        /* already dead */
      }
    }
  }
  // Give children a moment, then hard-exit so one dead process doesn't hang npm.
  setTimeout(() => process.exit(code), 300)
}

for (const { name, child } of children) {
  child.on('exit', (code, signal) => {
    if (signal) {
      console.error(`[${name}] exited via ${signal}`)
      shutdown(1)
      return
    }
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`)
      shutdown(code)
      return
    }
    // Clean exit of one side → tear down the other.
    shutdown(0)
  })
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

// Keep the parent alive while children run.
void api
void web
