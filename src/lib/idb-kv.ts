// Minimal IndexedDB key/value store for persisted app data.
//
// Why: the app previously persisted every zustand store into localStorage, which
// has a hard ~5MB per-origin cap that is INDEPENDENT of disk free space. A large
// X-intel corpus + stacked report snapshots (each embedding analytics + narrative)
// crossed that ceiling and writes began throwing QuotaExceededError — reports were
// built in memory but never saved. IndexedDB has origin quotas in the hundreds of
// MB to GB range, so moving the blob here removes that wall.
//
// This stores opaque strings (already AES-GCM-encrypted envelopes from
// device-crypto) under string keys in a single object store.

const DB_NAME = 'venice-app-store'
const STORE_NAME = 'kv'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('IndexedDB open blocked'))
  }).catch((err) => {
    dbPromise = null // allow retry on transient failure
    throw err
  })
  return dbPromise
}

export async function idbKvGet(key: string): Promise<string | null> {
  const db = await openDb()
  return new Promise<string | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => {
      const v = req.result
      resolve(typeof v === 'string' ? v : null)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function idbKvSet(key: string, value: string): Promise<void> {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(value, key)
    tx.oncomplete = () => resolve()
    // Surfaces quota errors as tx.error (e.g. QuotaExceededError) so callers can react.
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'))
  })
}

export async function idbKvDelete(key: string): Promise<void> {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB delete aborted'))
  })
}
