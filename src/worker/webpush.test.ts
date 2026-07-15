// The encryption path is checked against RFC 8291 Appendix A — the complete
// interoperability example. If encryptPayload reproduces the RFC's exact
// output body from its pinned keys and salt, the derivation chain (ECDH →
// HKDF → AES-128-GCM) and the aes128gcm framing are all correct.

import { describe, expect, it } from 'vitest'
import { b64url, encryptPayload, fromB64url, importAsKeys, vapidAuthHeader } from './webpush'

const VECTOR = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

describe('base64url', () => {
  it('round-trips', () => {
    const bytes = fromB64url(VECTOR.salt)
    expect(bytes.length).toBe(16)
    expect(b64url(bytes)).toBe(VECTOR.salt)
  })
})

describe('encryptPayload', () => {
  it('reproduces the RFC 8291 Appendix A message exactly', async () => {
    const asKeys = await importAsKeys(VECTOR.asPrivate, VECTOR.asPublic)
    const body = await encryptPayload(
      new TextEncoder().encode(VECTOR.plaintext),
      VECTOR.uaPublic,
      VECTOR.auth,
      { asKeys, salt: fromB64url(VECTOR.salt) },
    )
    expect(b64url(body)).toBe(VECTOR.body)
  })

  it('randomizes when not pinned (fresh key + salt per send)', async () => {
    const p = new TextEncoder().encode('llama')
    const a = await encryptPayload(p, VECTOR.uaPublic, VECTOR.auth)
    const b = await encryptPayload(p, VECTOR.uaPublic, VECTOR.auth)
    expect(b64url(a)).not.toBe(b64url(b))
    // header: salt(16) + rs(4) + idlen(1) + point(65), then ciphertext =
    // plaintext + delimiter + 16-byte GCM tag
    expect(a.length).toBe(16 + 4 + 1 + 65 + p.length + 1 + 16)
  })
})

describe('vapidAuthHeader', () => {
  it('emits a well-formed ES256 JWT bound to the endpoint origin', async () => {
    // Any P-256 pair works for shape-checking; reuse the vector's.
    const header = await vapidAuthHeader('https://fcm.googleapis.com/wp/abc123', {
      publicKey: VECTOR.asPublic,
      privateKey: VECTOR.asPrivate,
      subject: 'mailto:test@example.com',
    })
    const m = header.match(/^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/)
    expect(m).not.toBeNull()
    const [, h, c, sig, k] = m!
    const dec = (s: string) => JSON.parse(new TextDecoder().decode(fromB64url(s)))
    expect(dec(h)).toEqual({ typ: 'JWT', alg: 'ES256' })
    const claims = dec(c)
    expect(claims.aud).toBe('https://fcm.googleapis.com')
    expect(claims.sub).toBe('mailto:test@example.com')
    expect(claims.exp).toBeGreaterThan(Date.now() / 1000)
    expect(fromB64url(sig).length).toBe(64) // raw r||s
    expect(k).toBe(VECTOR.asPublic)

    // And the signature must actually verify with the public key.
    const { x, y } = { x: b64url(fromB64url(k).slice(1, 33)), y: b64url(fromB64url(k).slice(33, 65)) }
    const pub = await crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: 'P-256', x, y },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pub,
      fromB64url(sig) as BufferSource,
      new TextEncoder().encode(`${h}.${c}`) as BufferSource,
    )
    expect(ok).toBe(true)
  })
})
