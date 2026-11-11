import { randomUUID } from 'node:crypto'

import type { Order, Transaction } from '@/payload-types'
import type { PayloadRequest } from 'payload'
import type Stripe from 'stripe'
import { commitTransaction, initTransaction, killTransaction } from 'payload'

export const relationshipID = <T extends number | string>(value?: T | { id: T } | null) =>
  typeof value === 'object' ? value?.id : value

export type CheckoutSnapshot = {
  method: 'card' | 'boleto' | 'pix'
  email: string
  shippingAddress: Order['shippingAddress']
  language: 'en' | 'pt'
}

export async function releaseCheckout(
  transaction: Transaction,
  req: PayloadRequest,
  status: 'expired' | 'failed',
) {
  await req.payload.db.updateOne({
    collection: 'transactions',
    data: { status, stripe: { checkoutCartKey: null } },
    options: { atomic: true },
    req,
    where: { id: { equals: transaction.id }, status: { equals: 'pending' } },
  })
}

export async function settleCheckout(
  session: Stripe.Checkout.Session,
  transaction: Transaction,
  req: PayloadRequest,
) {
  if (
    session.payment_status !== 'paid' ||
    session.mode !== 'payment' ||
    session.metadata?.payloadTransactionID !== String(transaction.id) ||
    session.id !== transaction.stripe?.checkoutSessionID ||
    session.amount_total !== transaction.amount ||
    session.currency?.toUpperCase() !== transaction.currency
  ) {
    throw new Error('Stripe session does not match the paid transaction.')
  }

  const cartID = relationshipID(transaction.cart)
  const items = transaction.items
  const snapshot = transaction.stripe.checkoutSnapshot as CheckoutSnapshot | undefined
  if (!items?.length || !snapshot) throw new Error('Stripe transaction snapshot is missing.')

  const { payload } = req
  const shouldCommit = await initTransaction(req)
  try {
    if (!(await req.transactionID))
      throw new Error('Database transactions are required to settle payment.')

    const claim = await payload.db.updateOne({
      collection: 'transactions',
      data: { status: 'processing' },
      options: { atomic: true },
      req,
      where: { id: { equals: transaction.id }, status: { equals: 'pending' } },
    })

    if (claim) {
      const order = await payload.create({
        collection: 'orders',
        data: {
          amount: transaction.amount,
          currency: transaction.currency,
          customer: relationshipID(transaction.customer),
          customerEmail: transaction.customerEmail,
          items,
          shippingAddress: snapshot.shippingAddress,
          status: 'processing',
          transactions: [transaction.id],
        },
        req,
      })

      for (const item of items) {
        const variantID = relationshipID(item.variant)
        const id = variantID ?? relationshipID(item.product)
        if (!id) throw new Error('An inventory target is missing.')

        const inventory = await payload.db.updateOne({
          collection: variantID ? 'variants' : 'products',
          id,
          data: { inventory: { $inc: -item.quantity } },
          req,
        })
        if (!inventory) throw new Error('Inventory could not be updated.')
      }

      if (cartID) {
        await payload.db.updateOne({
          collection: 'carts',
          id: cartID,
          data: {
            purchasedAt: new Date().toISOString(),
            ...(transaction.customer ? {} : { secret: randomUUID() }),
          },
          req,
        })
      }
      await payload.update({
        collection: 'transactions',
        id: transaction.id,
        data: {
          order: order.id,
          status: 'succeeded',
          stripe: { paymentIntentID: relationshipID(session.payment_intent) },
        },
        req,
      })
    }

    const confirmed = await payload.findByID({
      collection: 'transactions',
      id: transaction.id,
      depth: 0,
      req,
    })
    const orderID = relationshipID(confirmed.order)
    if (confirmed.status !== 'succeeded' || !orderID) {
      throw new Error('Stripe transaction could not be settled.')
    }

    if (shouldCommit) await commitTransaction(req)
    return orderID
  } catch (error) {
    if (shouldCommit) await killTransaction(req)
    throw error
  }
}
