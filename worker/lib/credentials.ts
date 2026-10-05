function decodeBase64(value: string) {
  const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
  if (bytes.length !== 32) throw new Error('CREDENTIALS_ENCRYPTION_KEY must contain 32 bytes')
  return bytes
}

function encodeBase64Url(value: Uint8Array) {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
}

async function keyFromSecret(secret: string) {
  return crypto.subtle.importKey('raw', decodeBase64(secret), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptCredential(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFromSecret(secret), new TextEncoder().encode(value))
  return `${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(encrypted))}`
}

export async function decryptCredential(value: string, secret: string) {
  const [iv, encrypted] = value.split('.')
  if (!iv || !encrypted) throw new Error('Invalid encrypted credential')
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decodeBase64Url(iv) }, await keyFromSecret(secret), decodeBase64Url(encrypted))
  return new TextDecoder().decode(decrypted)
}
