import { stripeAdapter } from '@payloadcms/plugin-ecommerce/payments/stripe'
import type { PaymentAdapter } from '@payloadcms/plugin-ecommerce/types'

import { stripeCheckoutEndpoints } from './checkoutEndpoints'
import { stripeCheckoutFields } from './fields'
import { initiateStripeCheckout } from './initiateStripeCheckout'
import { getStripeSettings } from './settings'

const legacyStripe = (secretKey: string) =>
  stripeAdapter({
    secretKey,
    publishableKey: '',
    groupOverrides: { fields: ({ defaultFields }) => [...defaultFields, ...stripeCheckoutFields] },
  })

// Preserve confirmation of PaymentIntents created by the previous checkout.
export const stripeCheckout: PaymentAdapter = {
  ...legacyStripe(''),
  endpoints: stripeCheckoutEndpoints,
  initiatePayment: initiateStripeCheckout,
  confirmOrder: async (args) => {
    const { secretKey } = await getStripeSettings(args.req.payload, args.req)
    if (!secretKey) throw new Error('Stripe is unavailable.')
    return legacyStripe(secretKey).confirmOrder(args)
  },
}
