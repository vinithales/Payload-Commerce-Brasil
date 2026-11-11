import { randomUUID } from 'node:crypto'
import type { PaymentAdapter } from '@payloadcms/plugin-ecommerce/types'
import { APIError } from 'payload'
import Stripe from 'stripe'

import type { Address, Transaction } from '@/payload-types'
import { adminText } from '@/translations'
import { getCartItemPrices } from '@/utilities/getCartItemPrices'
import { getServerSideURL } from '@/utilities/getURL'
import { quotePayment, type StripeMethod } from './methods'
import { getStripeSettings } from './settings'
import { relationshipID, releaseCheckout, type CheckoutSnapshot } from './settleCheckout'

function addressFields(address?: Partial<Address>) {
  if (!address || typeof address !== 'object') return undefined
  const {
    title,
    firstName,
    lastName,
    company,
    addressLine1,
    addressLine2,
    city,
    state,
    postalCode,
    country,
    phone,
  } = address
  return {
    title,
    firstName,
    lastName,
    company,
    addressLine1,
    addressLine2,
    city,
    state,
    postalCode,
    country,
    phone,
  }
}

export const initiateStripeCheckout: PaymentAdapter['initiatePayment'] = async ({
  data: { cart, customerEmail, billingAddress, shippingAddress },
  req,
}) => {
  const { payload, user } = req
  const settings = await getStripeSettings(payload, req)
  const method = req.data?.paymentMethodType as StripeMethod
  if (!settings.secretKey || !settings.checkout.methods.includes(method)) {
    throw new APIError('This payment method is unavailable.', 400)
  }

  const currentCart = await payload.findByID({
    collection: 'carts',
    id: cart.id,
    depth: 0,
    overrideAccess: false,
    req,
  })
  if (currentCart.purchasedAt || !currentCart.items?.length) {
    throw new APIError('An active cart is required.', 400)
  }

  const items = []
  const inventoryQuantities = new Map<string, number>()
  let subtotal = 0
  for (const item of currentCart.items) {
    const productID = relationshipID(item.product)
    const variantID = relationshipID(item.variant)
    if (!productID || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new APIError('Invalid cart item.', 400)
    }

    const product = await payload.findByID({ collection: 'products', id: productID, depth: 0, req })
    const variant = variantID
      ? await payload.findByID({ collection: 'variants', id: variantID, depth: 0, req })
      : undefined

    if (
      product._status !== 'published' ||
      product.visibility === 'hidden' ||
      (product.enableVariants && (!variant || relationshipID(variant.product) !== product.id)) ||
      (variant && (!product.enableVariants || variant._status !== 'published'))
    ) {
      throw new APIError('A cart item is unavailable.', 400)
    }

    const inventoryKey = variant ? `variant:${variant.id}` : `product:${product.id}`
    const quantity = (inventoryQuantities.get(inventoryKey) ?? 0) + item.quantity
    inventoryQuantities.set(inventoryKey, quantity)
    const inventory = variant ? variant.inventory : product.inventory
    if (typeof inventory === 'number' && quantity > inventory) {
      throw new APIError('One or more items in your cart are out of stock.', 400, {
        code: 'OutOfStock',
      })
    }

    const { regularAmount, promotionalAmount } = getCartItemPrices(product, variant)
    const unitPrice = promotionalAmount ?? regularAmount
    if (typeof unitPrice !== 'number' || !Number.isSafeInteger(unitPrice) || unitPrice < 0) {
      throw new APIError('A cart item has an invalid price.', 400)
    }

    subtotal += unitPrice * item.quantity
    items.push({ product: productID, variant: variantID, quantity: item.quantity })
  }

  const quote = quotePayment(method, subtotal, settings.checkout.brlExchangeRate)
  if (!quote || req.data?.expectedAmount !== quote.amount) {
    throw new APIError('The total has changed. Refresh checkout and try again.', 400)
  }

  const billing = addressFields(billingAddress)
  const shipping = addressFields(shippingAddress) ?? billing
  if (!billing?.country || !shipping?.country) throw new APIError('An address is required.', 400)
  if (method !== 'card' && billing.country !== 'BR') {
    throw new APIError('This payment method requires a Brazilian billing address.', 400)
  }

  const snapshot: CheckoutSnapshot = {
    method,
    email: customerEmail.trim().toLowerCase(),
    shippingAddress: shipping,
    language: req.data?.language === 'en' ? 'en' : 'pt',
  }
  const stripe = new Stripe(settings.secretKey, { maxNetworkRetries: 2 })
  const cartKey = String(currentCart.id)
  const findActive = async () => {
    const result = await payload.find({
      collection: 'transactions',
      depth: 0,
      limit: 1,
      req,
      where: { 'stripe.checkoutCartKey': { equals: cartKey } },
    })
    return result.docs[0]
  }

  let transaction = await findActive()
  if (!transaction) {
    try {
      transaction = await payload.create({
        collection: 'transactions',
        data: {
          ...quote,
          ...(user ? { customer: user.id } : { customerEmail: snapshot.email }),
          billingAddress: billing,
          cart: currentCart.id,
          items,
          paymentMethod: 'stripe',
          status: 'pending',
          stripe: {
            checkoutCartKey: cartKey,
            checkoutToken: randomUUID(),
            checkoutSnapshot: snapshot,
          },
        },
        req,
      })
    } catch (error) {
      // A simultaneous request may have claimed this cart.
      transaction = await findActive()
      if (!transaction) throw error
    }
  }

  if (transaction.status !== 'pending' || !transaction.stripe?.checkoutToken) {
    throw new APIError('This cart already has a payment.', 409)
  }
  const stored = transaction.stripe.checkoutSnapshot as CheckoutSnapshot
  const sameItems =
    transaction.items?.length === items.length &&
    items.every((item, index) => {
      const saved = transaction.items?.[index]
      return (
        item.product === relationshipID(saved?.product) &&
        item.variant === relationshipID(saved?.variant) &&
        item.quantity === saved?.quantity
      )
    })
  const sameCheckout =
    stored.method === method &&
    stored.email === snapshot.email &&
    transaction.amount === quote.amount &&
    transaction.currency === quote.currency &&
    sameItems &&
    sameAddress(stored.shippingAddress, shipping) &&
    sameAddress(transaction.billingAddress, billing)

  const confirmationURL = new URL('/checkout/confirm-order', getServerSideURL())
  confirmationURL.searchParams.set('checkout', transaction.stripe.checkoutToken)
  const cancelURL = new URL(confirmationURL)
  cancelURL.searchParams.set('cancel', '1')

  const session = transaction.stripe.checkoutSessionID
    ? await stripe.checkout.sessions.retrieve(transaction.stripe.checkoutSessionID)
    : await createSession(stripe, transaction, stored, confirmationURL, cancelURL, req)

  if (session.status === 'expired') {
    await releaseCheckout(transaction, req, 'expired')
    throw new APIError('This payment session has expired. Try again.', 409)
  }
  if (session.status === 'complete' && sameCheckout) {
    return { message: 'Payment submitted.', url: confirmationURL.toString() }
  }
  if (session.status !== 'open' || !session.url || !sameCheckout) {
    // Expiring an open session prevents payment against an outdated cart or quote.
    if (session.status === 'open') {
      await stripe.checkout.sessions.expire(session.id)
      await releaseCheckout(transaction, req, 'expired')
    }
    throw new APIError('The existing payment session could not be resumed. Try again.', 409)
  }
  return { message: 'Payment initiated successfully.', url: session.url }
}

function sameAddress(left: Transaction['billingAddress'], right: Transaction['billingAddress']) {
  const fields = Object.keys(addressFields({}) ?? {}) as (keyof NonNullable<
    Transaction['billingAddress']
  >)[]
  return fields.every((field) => (left?.[field] ?? '') === (right?.[field] ?? ''))
}

async function createSession(
  stripe: Stripe,
  transaction: Transaction,
  snapshot: CheckoutSnapshot,
  confirmationURL: URL,
  cancelURL: URL,
  req: Parameters<PaymentAdapter['initiatePayment']>[0]['req'],
) {
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        locale: snapshot.language === 'pt' ? 'pt-BR' : 'en',
        customer_email: snapshot.email,
        payment_method_types: [snapshot.method],
        line_items: [
          {
            price_data: {
              currency: transaction.currency!.toLowerCase(),
              unit_amount: transaction.amount!,
              product_data: { name: adminText('Order total', snapshot.language) },
            },
            quantity: 1,
          },
        ],
        adaptive_pricing: { enabled: false },
        success_url: confirmationURL.toString(),
        cancel_url: cancelURL.toString(),
        metadata: { payloadTransactionID: String(transaction.id) },
      },
      { idempotencyKey: `payload-checkout-${transaction.stripe?.checkoutToken}` },
    )
  } catch (error) {
    if (
      error instanceof Stripe.errors.StripeInvalidRequestError ||
      error instanceof Stripe.errors.StripeAuthenticationError
    ) {
      await releaseCheckout(transaction, req, 'failed')
    }
    throw error
  }

  await req.payload.db.updateOne({
    collection: 'transactions',
    id: transaction.id,
    data: { stripe: { checkoutSessionID: session.id } },
    req,
  })
  return session
}
