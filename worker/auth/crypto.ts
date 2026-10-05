const encode = new TextEncoder()
export async function digest(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encode.encode(value))), (b) => b.toString(16).padStart(2, '0')).join('')
}
export function randomToken() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('') }
export async function hashPassword(password: string, salt = randomToken()) {
  const key = await crypto.subtle.importKey('raw', encode.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encode.encode(salt), iterations: 100000 }, key, 256)
  return `${salt}:${Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('')}`
}
export async function verifyPassword(password: string, hash: string) {
  const candidate = await hashPassword(password, hash.split(':')[0])
  if (candidate.length !== hash.length) return false
  let diff = 0
  for (let i = 0; i < hash.length; i++) diff |= candidate.charCodeAt(i) ^ hash.charCodeAt(i)
  return diff === 0
}
