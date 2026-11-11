// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const { createSession, retrieveSession, testDatabase } = vi.hoisted(() => {
  const testDatabase = process.env.STRIPE_CHECKOUT_TEST_DATABASE_URL
  if (testDatabase) process.env.DATABASE_URL = testDatabase
  return { createSession: vi.fn(), retrieveSession: vi.fn(), testDatabase }
})

vi.mock('stripe', async (importOriginal) => {
  const { default: Stripe } = await importOriginal<typeof import('stripe')>()
  return {
    default: class extends Stripe {
      constructor(...args: ConstructorParameters<typeof Stripe>) {
        super(...args)
        this.checkout.sessions.create = createSession
        this.checkout.sessions.retrieve = retrieveSession
      }
    },
  }
})

import config from '@/payload.config'
import { getStripeSettings } from '@/payments/settings'
import type { Address } from '@/payload-types'
import { getPayload, handleEndpoints, type Payload } from 'payload'
import Stripe from 'stripe'

const secretKey = 'sk_test_checkout_integration'
const webhookSecret = 'whsec_checkout_integration'
const address: Partial<Address> = {
  firstName: 'Checkout',
  lastName: 'Customer',
  addressLine1: '123 Test Street',
  city: 'Sao Paulo',
  state: 'SP',
  country: 'BR',
  postalCode: '01001-000',
}

it('keeps both virtual Stripe credential fields editable in the admin', async () => {
  const { globals } = await config
  const paymentMethods = globals.find(({ slug }) => slug === 'payment-methods')
  const tabs = paymentMethods?.fields.find((field) => field.type === 'tabs')
  const stripe = tabs?.tabs.find((tab) => 'name' in tab && tab.name === 'stripe')

  expect(stripe?.fields).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'secretKey',
        virtual: true,
        admin: expect.objectContaining({ readOnly: false }),
      }),
      expect.objectContaining({
        name: 'webhookSecret',
        virtual: true,
        admin: expect.objectContaining({ readOnly: false }),
      }),
    ]),
  )
})

describe.skipIf(!testDatabase)('Stripe Checkout', () => {
  let payload: Payload
  let session: Stripe.Checkout.Session

  beforeAll(async () => {
    payload = await getPayload({ config })
  }, 30_000)

  afterAll(async () => {
    await payload?.destroy()
  })

  const post = (path: string, body: unknown, signature?: string) =>
    handleEndpoints({
      config,
      request: new Request(`http://localhost:3000/api${path}`, {
        body: JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json',
          ...(signature && { 'stripe-signature': signature }),
        },
        method: 'POST',
      }),
    })

  function webhook(type: Stripe.Event.Type, data: Stripe.Checkout.Session, valid = true) {
    const body = { type, data: { object: data } }
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: JSON.stringify(body),
      secret: valid ? webhookSecret : 'whsec_invalid',
    })
    return post('/payments/stripe/webhooks', body, signature)
  }

  it('keeps credentials private and preserves them when changing toggles', async () => {
    const update = await payload.updateGlobal({
      slug: 'payment-methods',
      data: {
        stripe: {
          secretKey,
          webhookSecret,
          card: false,
          boleto: true,
          pix: true,
          brlExchangeRate: 5,
        },
      },
    })
    expect(JSON.stringify(update)).not.toContain(secretKey)
    expect(JSON.stringify(update)).not.toContain(webhookSecret)
    expect(JSON.stringify(update)).not.toContain('encryptedSecretKey')

    await payload.updateGlobal({ slug: 'payment-methods', data: { stripe: { pix: false } } })
    const stored = await getStripeSettings(payload)
    expect(stored.secretKey).toBe(secretKey)
    expect(stored.webhookSecret).toBe(webhookSecret)
    expect(stored.checkout).toEqual({ methods: ['boleto'], brlExchangeRate: 5 })

    const response = await handleEndpoints({
      config,
      request: new Request('http://localhost:3000/api/globals/payment-methods'),
    })
    expect(response.status).toBe(403)
  })

  it('charges the server-calculated quote and settles a delayed payment only once', async () => {
    await payload.updateGlobal({
      slug: 'payment-methods',
      data: {
        stripe: {
          secretKey,
          webhookSecret,
          card: false,
          boleto: true,
          pix: false,
          brlExchangeRate: 5,
        },
      },
    })

    const sku = crypto.randomUUID()
    const product = await payload.create({
      collection: 'products',
      data: {
        title: 'Checkout test product',
        slug: `checkout-${sku}`,
        sku,
        visibility: 'visible',
        inventory: 5,
        priceInUSDEnabled: true,
        priceInUSD: 1000,
        promotionalPriceInUSD: 900,
        weight: 1,
        width: 1,
        height: 1,
        length: 1,
        _status: 'published',
      },
    })
    const cart = await payload.create({
      collection: 'carts',
      data: { currency: 'USD', items: [{ product: product.id, quantity: 2 }] },
    })
    const request = {
      cartID: cart.id,
      secret: cart.secret,
      customerEmail: 'checkout@example.com',
      billingAddress: address,
      expectedAmount: 9000,
      paymentMethodType: 'boleto',
    }

    expect((await post('/payments/stripe/initiate', { ...request, secret: 'incorrect' })).ok).toBe(
      false,
    )
    expect(
      (await post('/payments/stripe/initiate', { ...request, paymentMethodType: 'pix' })).ok,
    ).toBe(false)
    expect((await post('/payments/stripe/initiate', { ...request, expectedAmount: 1 })).ok).toBe(
      false,
    )
    expect(createSession).not.toHaveBeenCalled()

    createSession.mockImplementation((params: Stripe.Checkout.SessionCreateParams) => {
      session = {
        id: `cs_test_${sku}`,
        status: 'open',
        mode: 'payment',
        payment_status: 'unpaid',
        amount_total: 9000,
        currency: 'brl',
        metadata: params.metadata ?? null,
        url: 'https://checkout.stripe.com/test-session',
      } as Stripe.Checkout.Session
      return session
    })
    retrieveSession.mockImplementation(() => session)
    const initiate = await post('/payments/stripe/initiate', request)
    expect(await initiate.json()).toMatchObject({ url: 'https://checkout.stripe.com/test-session' })
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_method_types: ['boleto'],
        line_items: [
          {
            price_data: {
              currency: 'brl',
              unit_amount: 9000,
              product_data: { name: 'Total do pedido' },
            },
            quantity: 1,
          },
        ],
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    )

    expect((await post('/payments/stripe/initiate', request)).ok).toBe(true)
    expect(createSession).toHaveBeenCalledTimes(1)
    const id = Number(session.metadata?.payloadTransactionID)
    const transaction = () => payload.findByID({ collection: 'transactions', id, depth: 0 })

    expect(
      (await webhook('checkout.session.completed', { ...session, status: 'complete' })).ok,
    ).toBe(true)
    expect((await transaction()).status).toBe('pending')

    const paid = {
      ...session,
      status: 'complete',
      payment_status: 'paid',
      payment_intent: 'pi_test',
    } as const
    expect((await webhook('checkout.session.async_payment_succeeded', paid, false)).status).toBe(
      400,
    )
    expect((await transaction()).order).toBeFalsy()
    expect((await webhook('checkout.session.async_payment_succeeded', paid)).ok).toBe(true)
    expect((await webhook('checkout.session.async_payment_succeeded', paid)).ok).toBe(true)

    const settled = await transaction()
    expect(settled.status).toBe('succeeded')
    expect(settled.order).toEqual(expect.any(Number))
    expect(
      await payload.findByID({ collection: 'orders', id: settled.order as number }),
    ).toMatchObject({
      amount: 9000,
      currency: 'BRL',
      shippingAddress: address,
    })
    expect((await payload.findByID({ collection: 'products', id: product.id })).inventory).toBe(3)
    expect((await payload.findByID({ collection: 'carts', id: cart.id })).purchasedAt).toBeTruthy()
  }, 30_000)
})
