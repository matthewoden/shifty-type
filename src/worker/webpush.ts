// Dependency-free Web Push sender for the Worker runtime — WebCrypto only,
// so the bundle stays tiny and it runs anywhere subtle crypto exists (the
// unit tests exercise it in node against the RFC 8291 test vector).
//
//   RFC 8292 — VAPID: an ES256 JWT proves the sender to the push service
//   RFC 8291 — how the payload key is derived from the subscription
//   RFC 8188 — the aes128gcm content encoding that wraps the payload

export interface PushSubscriptionJSON {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface VapidConfig {
  /** base64url, uncompressed P-256 point (65 bytes) — the `applicationServerKey`. */
  publicKey: string
  /** base64url, 32-byte scalar (the JWK `d`). Worker secret. */
  privateKey: string
  /** `mailto:` contact the push service may use about problems. */
  subject: string
}

const te = new TextEncoder()

export function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function fromB64url(s: string): Uint8Array {
  const padded = s.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(s.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** One-shot HKDF (extract + expand), as each RFC 8291 derivation uses it. */
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  bytes: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource },
    key,
    bytes * 8,
  )
  return new Uint8Array(bits)
}

/** Split an uncompressed P-256 point into the JWK x/y coordinates. */
function pointToJwk(publicKey: Uint8Array): { x: string; y: string } {
  if (publicKey.length !== 65 || publicKey[0] !== 0x04)
    throw new Error('expected a 65-byte uncompressed P-256 point')
  return { x: b64url(publicKey.slice(1, 33)), y: b64url(publicKey.slice(33, 65)) }
}

interface AsKeys {
  /** ECDH private key for the shared secret. */
  ecdh: CryptoKey
  /** The matching uncompressed public point. */
  publicPoint: Uint8Array
}

async function generateAsKeys(): Promise<AsKeys> {
  // Workers types return CryptoKey | CryptoKeyPair / ArrayBuffer | JsonWebKey
  // here; both are statically known from the arguments.
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair
  const raw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer)
  return { ecdh: pair.privateKey, publicPoint: raw }
}

/** Rebuild the RFC 8291 test keys from raw scalars — tests only. */
export async function importAsKeys(privateKey: string, publicKey: string): Promise<AsKeys> {
  const publicPoint = fromB64url(publicKey)
  const { x, y } = pointToJwk(publicPoint)
  const ecdh = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: privateKey, x, y },
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  )
  return { ecdh, publicPoint }
}

/**
 * RFC 8291 payload encryption, producing the full aes128gcm body
 * (header || ciphertext). `test` lets the unit test pin the ephemeral key
 * and salt to the RFC vector; production callers always randomize.
 */
export async function encryptPayload(
  plaintext: Uint8Array,
  p256dh: string,
  auth: string,
  test?: { asKeys: AsKeys; salt: Uint8Array },
): Promise<Uint8Array> {
  const uaPublicPoint = fromB64url(p256dh)
  const authSecret = fromB64url(auth)
  const as = test?.asKeys ?? (await generateAsKeys())
  const salt = test?.salt ?? crypto.getRandomValues(new Uint8Array(16))

  const uaPublic = await crypto.subtle.importKey(
    'raw',
    uaPublicPoint as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  // Standard WebCrypto spells this `public`; the generated Workers types
  // spell it `$public` (a codegen artifact), so route around them.
  const ecdhAlg = { name: 'ECDH', public: uaPublic } as unknown as Parameters<
    typeof crypto.subtle.deriveBits
  >[0]
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(ecdhAlg, as.ecdh, 256))

  // ikm = HKDF(auth, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const keyInfo = concat(te.encode('WebPush: info'), new Uint8Array([0]), uaPublicPoint, as.publicPoint)
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32)
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12)

  // Single record: plaintext || 0x02 (the last-record padding delimiter).
  const padded = concat(plaintext, new Uint8Array([2]))
  const gcmKey = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, [
    'encrypt',
  ])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, gcmKey, padded as BufferSource),
  )

  // RFC 8188 header: salt(16) || rs(4, BE) || idlen(1) || keyid(as_public, 65)
  const header = concat(
    salt,
    new Uint8Array([0, 0, 0x10, 0]), // rs = 4096
    new Uint8Array([as.publicPoint.length]),
    as.publicPoint,
  )
  return concat(header, ciphertext)
}

/** RFC 8292 VAPID JWT: ES256 over {aud, exp, sub}. WebCrypto's ECDSA output
 *  is already the raw r||s JOSE wants — no DER dance. */
export async function vapidAuthHeader(endpoint: string, vapid: VapidConfig): Promise<string> {
  const { x, y } = pointToJwk(fromB64url(vapid.publicKey))
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: vapid.privateKey, x, y },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const enc = (o: unknown) => b64url(te.encode(JSON.stringify(o)))
  const claims = {
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: vapid.subject,
  }
  const signingInput = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc(claims)}`
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      te.encode(signingInput) as BufferSource,
    ),
  )
  return `vapid t=${signingInput}.${b64url(sig)}, k=${vapid.publicKey}`
}

export type PushResult = 'sent' | 'gone' | 'failed'

/**
 * Deliver one push. 'gone' means the subscription is dead (uninstalled,
 * permission revoked) and should be deleted by the caller; 'failed' is
 * transient — an async game doesn't retry, the next move nudges again.
 */
export async function sendPush(
  sub: PushSubscriptionJSON,
  payload: unknown,
  vapid: VapidConfig,
): Promise<PushResult> {
  try {
    const body = await encryptPayload(
      te.encode(JSON.stringify(payload)),
      sub.keys.p256dh,
      sub.keys.auth,
    )
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidAuthHeader(sub.endpoint, vapid),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(7 * 24 * 3600), // matches idle for days; let the nudge wait too
        Urgency: 'normal',
      },
      body: body as unknown as BodyInit,
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status === 404 || res.status === 410) return 'gone'
    return res.ok ? 'sent' : 'failed'
  } catch {
    return 'failed'
  }
}
