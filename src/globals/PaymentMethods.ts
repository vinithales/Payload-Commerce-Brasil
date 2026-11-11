import type { GlobalConfig } from 'payload'
import { ValidationError } from 'payload'

import { adminOnly } from '@/access/adminOnly'
import { encryptCredential } from '@/payments/credentials'
import { isStripeSecretKey, isStripeWebhookSecret, readPaymentSettings } from '@/payments/settings'
import { adminLabel, adminText } from '@/translations'

export const PaymentMethods: GlobalConfig = {
  slug: 'payment-methods',
  label: adminLabel('Payment Methods'),
  access: { read: adminOnly, update: adminOnly },
  admin: { group: adminLabel('Settings') },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          name: 'stripe',
          label: 'Stripe',
          admin: {
            description: adminLabel(
              'Enable the same methods in the Stripe Dashboard. Pix and Boleto require an eligible account.',
            ),
          },
          fields: [
            {
              name: 'secretKey',
              type: 'text',
              virtual: true,
              label: adminLabel('Stripe secret key'),
              admin: {
                readOnly: false,
                description: adminLabel(
                  'Enter a Stripe API secret key starting with sk_test_ or sk_live_. Leave blank to keep the current key.',
                ),
              },
            },
            {
              name: 'webhookSecret',
              type: 'text',
              virtual: true,
              label: adminLabel('Stripe webhook signing secret'),
              admin: {
                readOnly: false,
                description: adminLabel(
                  'Enter the signing secret for /api/payments/stripe/webhooks. Leave blank to keep the current secret.',
                ),
              },
            },
            { name: 'encryptedSecretKey', type: 'text', hidden: true },
            { name: 'encryptedWebhookSecret', type: 'text', hidden: true },
            {
              type: 'row',
              fields: [
                { name: 'card', type: 'checkbox', label: adminLabel('Card'), defaultValue: true },
                {
                  name: 'boleto',
                  type: 'checkbox',
                  label: adminLabel('Boleto'),
                  defaultValue: false,
                },
                { name: 'pix', type: 'checkbox', label: adminLabel('Pix'), defaultValue: false },
              ],
            },
            {
              name: 'brlExchangeRate',
              type: 'number',
              label: adminLabel('USD to BRL exchange rate'),
              admin: {
                description: adminLabel(
                  'Amount in BRL per 1 USD. Required for Pix and Boleto. Card payments stay in USD.',
                ),
              },
            },
          ],
        },
      ],
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, req }) => {
        const stored = await readPaymentSettings(req.payload, req)
        const stripe = { ...stored, ...data.stripe }
        const secretKey = typeof stripe.secretKey === 'string' ? stripe.secretKey.trim() : ''
        const webhookSecret =
          typeof stripe.webhookSecret === 'string' ? stripe.webhookSecret.trim() : ''
        const language = req.i18n.language
        const errors: { path: string; message: string }[] = []

        if (secretKey && !isStripeSecretKey(secretKey)) {
          errors.push({
            path: 'stripe.secretKey',
            message: adminText('Enter a valid Stripe secret key.', language),
          })
        }
        if (webhookSecret && !isStripeWebhookSecret(webhookSecret)) {
          errors.push({
            path: 'stripe.webhookSecret',
            message: adminText('Enter a valid Stripe webhook signing secret.', language),
          })
        }
        if (
          (stripe.pix || stripe.boleto) &&
          !(Number.isFinite(stripe.brlExchangeRate) && stripe.brlExchangeRate > 0)
        ) {
          errors.push({
            path: 'stripe.brlExchangeRate',
            message: adminText('Enter a positive exchange rate to enable Pix or Boleto.', language),
          })
        }
        if ((stripe.card ?? true) || stripe.pix || stripe.boleto) {
          const hasSecret =
            secretKey ||
            stored?.encryptedSecretKey ||
            isStripeSecretKey(process.env.STRIPE_SECRET_KEY)
          const hasWebhook =
            webhookSecret ||
            stored?.encryptedWebhookSecret ||
            isStripeWebhookSecret(process.env.STRIPE_WEBHOOKS_SIGNING_SECRET)
          if (!hasSecret || !hasWebhook) {
            errors.push({
              path: hasSecret ? 'stripe.webhookSecret' : 'stripe.secretKey',
              message: adminText(
                'Configure both Stripe credentials before enabling payment methods.',
                language,
              ),
            })
          }
        }
        if (errors.length) throw new ValidationError({ errors })

        delete stripe.secretKey
        delete stripe.webhookSecret
        stripe.encryptedSecretKey = secretKey
          ? encryptCredential(secretKey, req.payload.secret)
          : stored?.encryptedSecretKey
        stripe.encryptedWebhookSecret = webhookSecret
          ? encryptCredential(webhookSecret, req.payload.secret)
          : stored?.encryptedWebhookSecret
        return { ...data, stripe }
      },
    ],
  },
}
