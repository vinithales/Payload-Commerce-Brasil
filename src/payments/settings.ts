import type { Payload, PayloadRequest } from 'payload'

import { decryptCredential } from './credentials'
import type { CheckoutSettings, StripeMethod } from './methods'
import { stripeMethods } from './methods'

export const isStripeSecretKey = (value?: string | null) => /^sk_(test|live)_.+$/.test(value ?? '')
export const isStripeWebhookSecret = (value?: string | null) => /^whsec_.+$/.test(value ?? '')

export async function readPaymentSettings(payload: Payload, req?: PayloadRequest) {
  const settings = await payload.findGlobal({
    slug: 'payment-methods',
    depth: 0,
    req,
    showHiddenFields: true,
  })
  return settings.stripe
}

export async function getStripeSettings(payload: Payload, req?: PayloadRequest) {
  const saved = await readPaymentSettings(payload, req)
  const secretKey = saved?.encryptedSecretKey
    ? decryptCredential(saved.encryptedSecretKey, payload.secret)
    : process.env.STRIPE_SECRET_KEY?.trim()
  const webhookSecret = saved?.encryptedWebhookSecret
    ? decryptCredential(saved.encryptedWebhookSecret, payload.secret)
    : process.env.STRIPE_WEBHOOKS_SIGNING_SECRET?.trim()
  const rate = saved?.brlExchangeRate
  const brlExchangeRate =
    typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null
  const methods: StripeMethod[] = []

  if (isStripeSecretKey(secretKey) && isStripeWebhookSecret(webhookSecret)) {
    for (const method of Object.keys(stripeMethods) as StripeMethod[]) {
      if ((saved?.[method] ?? method === 'card') && (method === 'card' || brlExchangeRate)) {
        methods.push(method)
      }
    }
  }

  const checkout: CheckoutSettings = { methods, brlExchangeRate }
  return { checkout, secretKey, webhookSecret }
}
