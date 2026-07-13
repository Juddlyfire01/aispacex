import type { Plugin } from 'vite'

/** In-process Vite plugin that serves api/*.ts handlers (replaces vercel dev). */
export function devApiPlugin(): Plugin

/** Load .env / .env.local into process.env for the dev API handlers. */
export function loadDotEnv(): Promise<void>
