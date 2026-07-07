// Shared binary <-> base64 helpers for the crypto layers (device-crypto,
// auth-store). Single implementation so the encoders can't drift apart.
//
// Encoding is chunked: spreading a large buffer into String.fromCharCode's
// arguments overflows the call stack (RangeError) once payloads exceed ~100KB —
// which a gathered corpus + report history easily does. That made encryptString
// throw, the fail-closed storage layer skipped persisting, and reports vanished
// on reload/reconnect. Encode in 32KB slices instead.

const CHUNK = 0x8000

export function b64encode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

export function b64decode(str: string): Uint8Array<ArrayBuffer> {
  const bin = atob(str)
  const buf = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf
}
