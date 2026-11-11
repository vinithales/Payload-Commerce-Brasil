import type { Endpoint, Payload, PayloadRequest } from 'payload'
import Stripe from 'stripe'

import { getStripeSettings } from './settings'
import { relationshipID, releaseCheckout, settleCheckout } from './settleCheckout'

export async function findCheckout(payload: Payload, token: string, req?: PayloadRequest) {
  if (!/^[a-f0-9-]{36}$/.test(token)) return undefined

  const result = await payload.find({
    collection: 'transactions',
    depth: 0,
    limit: 1,
    req,
    where: { 'stripe.checkoutToken': { equals: token } },
  })
  return result.docs[0]
}

export const stripeCheckoutEndpoints: Endpoint[] = [
  {
    path: '/webhooks',
    method: 'post',
    handler: async (req) => {
      const settings = await getStripeSettings(req.payload, req)
      if (!settings.secretKey || !settings.webhookSecret) {
        return Response.json({ message: 'Stripe is unavailable.' }, { status: 503 })
      }
      const signature = req.headers.get('stripe-signature')
      if (!signature || !req.text) return new Response(null, { status: 400 })

      const stripe = new Stripe(settings.secretKey)
      let event: Stripe.Event
      try {
        event = stripe.webhooks.constructEvent(await req.text(), signature, settings.webhookSecret)
      } catch {
        return new Response(null, { status: 400 })
      }

      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded':
        case 'checkout.session.async_payment_failed':
        case 'checkout.session.expired': {
          const session = event.data.object
          const transactionID = Number(session.metadata?.payloadTransactionID)
          if (!Number.isSafeInteger(transactionID) || transactionID <= 0) break

          const transaction = await req.payload.findByID({
            collection: 'transactions',
            id: transactionID,
            disableErrors: true,
            depth: 0,
            req,
          })
          if (!transaction || transaction.stripe?.checkoutSessionID !== session.id) break

          if (session.payment_status === 'paid') {
            await settleCheckout(session, transaction, req)
          } else if (event.type === 'checkout.session.async_payment_failed') {
            await releaseCheckout(transaction, req, 'failed')
          } else if (event.type === 'checkout.session.expired') {
            await releaseCheckout(transaction, req, 'expired')
          }
          break
        }
      }

      return Response.json({ received: true })
    },
  },
  {
    path: '/cancel',
    method: 'post',
    handler: async (req) => {
      const data = await req.json?.().catch(() => null)
      const transaction =
        typeof data?.token === 'string' && (await findCheckout(req.payload, data.token, req))
      if (!transaction) return new Response(null, { status: 404 })
      if (transaction.status === 'expired' || transaction.status === 'failed') {
        return new Response(null, { status: 204 })
      }
      const sessionID = transaction.stripe?.checkoutSessionID
      if (transaction.status !== 'pending' || !sessionID) {
        return new Response(null, { status: 409 })
      }

      const { secretKey } = await getStripeSettings(req.payload, req)
      if (!secretKey) return new Response(null, { status: 503 })
      const stripe = new Stripe(secretKey)
      const session = await stripe.checkout.sessions.retrieve(sessionID)
      if (session.status === 'complete') return new Response(null, { status: 409 })
      if (session.status === 'open') await stripe.checkout.sessions.expire(sessionID)
      await releaseCheckout(transaction, req, 'expired')
      return new Response(null, { status: 204 })
    },
  },
]

export async function getCheckoutOrderURL(payload: Payload, orderID: number) {
  const order = await payload.findByID({ collection: 'orders', id: orderID, depth: 0 })
  if (relationshipID(order.customer)) return `/orders/${order.id}`
  const query = new URLSearchParams({
    email: order.customerEmail ?? '',
    accessToken: order.accessToken ?? '',
  })
  return `/orders/${order.id}?${query}`
}
