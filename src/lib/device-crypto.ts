// Device-bound encryption for at-rest intel data in the browser.
//
// Unlike auth-store.ts (passphrase-derived PBKDF2 key that the user unlocks each
// session), the intel caches must auto-decrypt silently on every page load. We
// can't require a passphrase for that, so instead we generate a NON-EXTRACTABLE
// AES-GCM key with the WebCrypto API and store the CryptoKey object itself in
// IndexedDB. Because the key is non-extractable, its raw bytes can never be read
// back out — not by our code, not by an attacker with disk access to the profile
// — while the browser can still use it to encrypt/decrypt. This gives honest
// "encrypted at rest" for the sensitive corpora (posts, bookmarks, likes,
// reports) with zero user friction.
//
// Threat model, stated plainly: this protects data at rest from casual
// disk/localStorage inspection and other origins. It does NOT protect against
// malicious code running on this same origin (which could ask the key to decrypt
// for it). That's inherent to any browser-local scheme without a passphrase.

import { b64encode, b64decode } from './base64'

const DB_NAME = 'venice-intel-crypto'
const STORE_NAME = 'keys'
const KEY_ID = 'intel-data-key-v1'

let keyPromise: Promise<CryptoKey> | null = null

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbGet(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Get (or lazily create) the device-bound non-extractable AES-GCM key. Cached in
 * a module-level promise so concurrent stores share one key + one IndexedDB open.
 */
export function getDeviceKey(): Promise<CryptoKey> {
  keyPromise ??= (async () => {
    const db = await openDb()
    const existing = await idbGet(db, KEY_ID)
    if (existing instanceof CryptoKey) return existing
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // non-extractable: raw bytes can never leave the browser
      ['encrypt', 'decrypt'],
    )
    await idbPut(db, KEY_ID, key)
    return key
  })().catch((err) => {
    keyPromise = null // allow retry on transient failure
    throw err
  })
  return keyPromise
}

/** Encrypt a UTF-8 string to a compact "iv.ct" base64 envelope. */
export async function encryptString(plaintext: string): Promise<string> {
  const key = await getDeviceKey()
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  return `${b64encode(iv.buffer)}.${b64encode(ct)}`
}

/** Decrypt an "iv.ct" envelope produced by encryptString. Throws on tamper/mismatch. */
export async function decryptString(envelope: string): Promise<string> {
  const key = await getDeviceKey()
  const [ivB64, ctB64] = envelope.split('.')
  if (!ivB64 || !ctB64) throw new Error('Malformed ciphertext envelope')
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64decode(ivB64) },
    key,
    b64decode(ctB64),
  )
  return new TextDecoder().decode(pt)
}
