'use client'

import { Media } from '@/components/Media'
import { Message } from '@/components/Message'
import { Price } from '@/components/Price'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/providers/Auth'
import Link from 'next/link'
import React, { useEffect, useRef, useState } from 'react'

import { AddressItem } from '@/components/addresses/AddressItem'
import { CreateAddressModal } from '@/components/addresses/CreateAddressModal'
import { CheckoutAddresses } from '@/components/checkout/CheckoutAddresses'
import { FormItem } from '@/components/forms/FormItem'
import { Checkbox } from '@/components/ui/checkbox'
import type { Address, Cart } from '@/payload-types'
import { getCartItemPrices } from '@/utilities/getCartItemPrices'
import { useAddresses, useCart, usePayments } from '@payloadcms/plugin-ecommerce/client/react'

import {
  quotePayment,
  stripeMethods,
  type CheckoutSettings,
  type StripeMethod,
} from '@/payments/methods'
import { adminText } from '@/translations'

type Props = { settings: CheckoutSettings; language: string }

export const CheckoutPage: React.FC<Props> = ({ settings, language }) => {
  const { user } = useAuth()
  const cart: Cart | undefined = useCart().cart
  const [error, setError] = useState<null | string>(null)
  /**
   * State to manage the email input for guest checkout.
   */
  const [email, setEmail] = useState('')
  const [emailEditable, setEmailEditable] = useState(true)
  const { initiatePayment } = usePayments()
  const { addresses } = useAddresses()
  const [shippingAddress, setShippingAddress] = useState<Partial<Address>>()
  const [billingAddress, setBillingAddress] = useState<Partial<Address>>()
  const [billingAddressSameAsShipping, setBillingAddressSameAsShipping] = useState(true)
  const [isProcessingPayment, setProcessingPayment] = useState(false)
  const [selectedMethod, setSelectedMethod] = useState<StripeMethod>()
  const redirecting = useRef(false)
  const text = (value: Parameters<typeof adminText>[0]) => adminText(value, language)

  const cartIsEmpty = !cart || !cart.items || !cart.items.length

  const subtotal = cart?.items?.reduce<number | null>((total, item) => {
    if (total === null || typeof item.product !== 'object' || !item.product) return null

    const { regularAmount, promotionalAmount } = getCartItemPrices(item.product, item.variant)
    const price = promotionalAmount ?? regularAmount
    return typeof price === 'number' ? total + price * item.quantity : null
  }, 0)
  const options = settings.methods.flatMap((method) => {
    if (method !== 'card' && billingAddress?.country !== 'BR') return []

    const quote = quotePayment(method, subtotal ?? 0, settings.brlExchangeRate)
    return quote ? [{ method, ...quote }] : []
  })
  const selectedOption = options.find((option) => option.method === selectedMethod) ?? options[0]
  const canGoToPayment = Boolean(
    ((email && !emailEditable) || user) &&
    billingAddress &&
    (billingAddressSameAsShipping || shippingAddress) &&
    selectedOption,
  )

  // On initial load wait for addresses to be loaded and check to see if we can prefill a default one
  useEffect(() => {
    if (!shippingAddress) {
      if (addresses && addresses.length > 0) {
        const defaultAddress = addresses[0]
        if (defaultAddress) {
          setBillingAddress(defaultAddress)
        }
      }
    }
  }, [addresses])

  async function goToPayment() {
    if (!canGoToPayment || !selectedOption || redirecting.current) return

    redirecting.current = true
    setProcessingPayment(true)
    setError(null)

    try {
      const result = await initiatePayment('stripe', {
        additionalData: {
          ...(email ? { customerEmail: email } : {}),
          billingAddress,
          shippingAddress: billingAddressSameAsShipping ? billingAddress : shippingAddress,
          paymentMethodType: selectedOption.method,
          expectedAmount: selectedOption.amount,
          language: language.startsWith('pt') ? 'pt' : 'en',
        },
      })
      if (
        !result ||
        typeof result !== 'object' ||
        !('url' in result) ||
        typeof result.url !== 'string'
      ) {
        throw new Error('Stripe Checkout URL is missing.')
      }
      window.location.assign(result.url)
    } catch (error) {
      const outOfStock = error instanceof Error && error.message.includes('OutOfStock')
      setError(
        text(
          outOfStock
            ? 'One or more items in your cart are out of stock.'
            : 'An error occurred while initiating payment.',
        ),
      )
      redirecting.current = false
      setProcessingPayment(false)
    }
  }

  if (cartIsEmpty) {
    return (
      <div className="prose dark:prose-invert py-12 w-full items-center">
        <p>Your cart is empty.</p>
        <Link href="/search">Continue shopping?</Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-stretch justify-stretch my-8 md:flex-row grow gap-10 md:gap-6 lg:gap-8">
      <div className="basis-full lg:basis-2/3 flex flex-col gap-8 justify-stretch">
        <h2 className="font-medium text-3xl">Contact</h2>
        {!user && (
          <div className=" bg-accent dark:bg-black rounded-lg p-4 w-full flex items-center">
            <div className="prose dark:prose-invert">
              <Button asChild className="no-underline text-inherit" variant="outline">
                <Link href="/login">Log in</Link>
              </Button>
              <p className="mt-0">
                <span className="mx-2">or</span>
                <Link href="/create-account">create an account</Link>
              </p>
            </div>
          </div>
        )}
        {user ? (
          <div className="bg-accent dark:bg-card rounded-lg p-4 ">
            <div>
              <p>{user.email}</p>{' '}
              <p>
                Not you?{' '}
                <Link className="underline" href="/logout">
                  Log out
                </Link>
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-accent dark:bg-black rounded-lg p-4 ">
            <div>
              <p className="mb-4">Enter your email to checkout as a guest.</p>

              <FormItem className="mb-6">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  disabled={!emailEditable}
                  id="email"
                  name="email"
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  type="email"
                />
              </FormItem>

              <Button
                disabled={!email || !emailEditable}
                onClick={(e) => {
                  e.preventDefault()
                  setEmailEditable(false)
                }}
                variant="default"
              >
                Continue as guest
              </Button>
            </div>
          </div>
        )}

        <h2 className="font-medium text-3xl">Address</h2>

        {billingAddress ? (
          <div>
            <AddressItem
              actions={
                <Button
                  variant={'outline'}
                  disabled={isProcessingPayment}
                  onClick={(e) => {
                    e.preventDefault()
                    setBillingAddress(undefined)
                  }}
                >
                  Remove
                </Button>
              }
              address={billingAddress}
            />
          </div>
        ) : user ? (
          <CheckoutAddresses heading="Billing address" setAddress={setBillingAddress} />
        ) : (
          <CreateAddressModal
            disabled={!email || Boolean(emailEditable)}
            callback={(address) => {
              setBillingAddress(address)
            }}
            skipSubmission={true}
          />
        )}

        <div className="flex gap-4 items-center">
          <Checkbox
            id="shippingTheSameAsBilling"
            checked={billingAddressSameAsShipping}
            disabled={Boolean(isProcessingPayment || (!user && (!email || Boolean(emailEditable))))}
            onCheckedChange={(state) => {
              setBillingAddressSameAsShipping(state as boolean)
            }}
          />
          <Label htmlFor="shippingTheSameAsBilling">Shipping is the same as billing</Label>
        </div>

        {!billingAddressSameAsShipping && (
          <>
            {shippingAddress ? (
              <div>
                <AddressItem
                  actions={
                    <Button
                      variant={'outline'}
                      disabled={isProcessingPayment}
                      onClick={(e) => {
                        e.preventDefault()
                        setShippingAddress(undefined)
                      }}
                    >
                      Remove
                    </Button>
                  }
                  address={shippingAddress}
                />
              </div>
            ) : user ? (
              <CheckoutAddresses
                heading="Shipping address"
                description="Please select a shipping address."
                setAddress={setShippingAddress}
              />
            ) : (
              <CreateAddressModal
                callback={(address) => {
                  setShippingAddress(address)
                }}
                disabled={!email || Boolean(emailEditable)}
                skipSubmission={true}
              />
            )}
          </>
        )}

        <fieldset className="flex flex-col gap-3" disabled={isProcessingPayment}>
          <legend className="mb-3 font-medium text-3xl">{text('Payment method')}</legend>
          {options.length === 0 && billingAddress && (
            <p>{text('No payment methods are available for this order.')}</p>
          )}
          {options.map((option) => (
            <label key={option.method} className="flex items-center gap-3 rounded-lg border p-4">
              <input
                type="radio"
                name="paymentMethod"
                value={option.method}
                checked={selectedOption?.method === option.method}
                onChange={() => setSelectedMethod(option.method)}
              />
              <span className="grow">{text(stripeMethods[option.method])}</span>
              <Price as="span" amount={option.amount} currencyCode={option.currency} />
            </label>
          ))}
        </fieldset>
        {error && <Message error={error} />}
        <Button
          className="self-start"
          disabled={!canGoToPayment || isProcessingPayment}
          onClick={() => void goToPayment()}
        >
          {text('Continue to Stripe')}
        </Button>
      </div>

      {!cartIsEmpty && (
        <div className="basis-full lg:basis-1/3 lg:pl-8 p-8 border-none bg-primary/5 flex flex-col gap-8 rounded-lg">
          <h2 className="text-3xl font-medium">Your cart</h2>
          {cart?.items?.map((item, index) => {
            if (typeof item.product === 'object' && item.product) {
              const {
                product,
                product: { meta, title, gallery },
                quantity,
                variant,
              } = item

              if (!quantity) return null

              let image = gallery?.[0]?.image || meta?.image
              const { regularAmount, promotionalAmount } = getCartItemPrices(product, variant)

              const isVariant = Boolean(variant) && typeof variant === 'object'

              if (isVariant) {
                const imageVariant = product.gallery?.find((item) => {
                  if (!item.variantOption) return false
                  const variantOptionID =
                    typeof item.variantOption === 'object'
                      ? item.variantOption.id
                      : item.variantOption

                  const hasMatch = variant?.options?.some((option) => {
                    if (typeof option === 'object') return option.id === variantOptionID
                    else return option === variantOptionID
                  })

                  return hasMatch
                })

                if (imageVariant && typeof imageVariant.image !== 'string') {
                  image = imageVariant.image
                }
              }

              const effectivePrice = promotionalAmount ?? regularAmount

              return (
                <div className="flex items-start gap-4" key={index}>
                  <div className="flex items-stretch justify-stretch h-20 w-20 p-2 rounded-lg border">
                    <div className="relative w-full h-full">
                      {image && typeof image !== 'string' && (
                        <Media className="" fill imgClassName="rounded-lg" resource={image} />
                      )}
                    </div>
                  </div>
                  <div className="flex grow justify-between items-center">
                    <div className="flex flex-col gap-1">
                      <p className="font-medium text-lg">{title}</p>
                      {variant && typeof variant === 'object' && (
                        <p className="text-sm font-mono text-primary/50 tracking-widest">
                          {variant.options
                            ?.map((option) => {
                              if (typeof option === 'object') return option.label
                              return null
                            })
                            .join(', ')}
                        </p>
                      )}
                      <div>
                        {'x'}
                        {quantity}
                      </div>
                    </div>

                    <div className="flex flex-col items-end">
                      {promotionalAmount !== undefined && typeof regularAmount === 'number' && (
                        <Price
                          amount={regularAmount}
                          as="span"
                          className="text-sm text-muted-foreground line-through"
                        />
                      )}
                      {typeof effectivePrice === 'number' && <Price amount={effectivePrice} />}
                    </div>
                  </div>
                </div>
              )
            }
            return null
          })}
          <hr />
          <div className="flex justify-between items-center gap-2">
            <span className="uppercase">Total</span>{' '}
            <Price className="text-3xl font-medium" amount={subtotal ?? cart.subtotal ?? 0} />
          </div>
        </div>
      )}
    </div>
  )
}
