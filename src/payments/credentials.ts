import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const algorithm = 'aes-256-gcm'
const key = (secret: string) =>
  createHash('sha256').update('stripe-payment-settings:').update(secret).digest()

export function encryptCredential(value: string, secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv(algorithm, key(secret), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64')
}

export function decryptCredential(value: string, secret: string) {
  const stored = Buffer.from(value, 'base64')
  const decipher = createDecipheriv(algorithm, key(secret), stored.subarray(0, 12))
  decipher.setAuthTag(stored.subarray(12, 28))
  return Buffer.concat([decipher.update(stored.subarray(28)), decipher.final()]).toString('utf8')
}
