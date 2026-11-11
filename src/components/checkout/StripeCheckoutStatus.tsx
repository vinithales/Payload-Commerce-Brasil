'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { Transaction } from '@/payload-types'
import { cartStorageKey } from '@/payments/methods'
import { adminText } from '@/translations'

type Props = {
  token: string
  language: string
  status?: Transaction['status']
  cancel: boolean
  cartID?: number
  orderURL?: string
}

export function StripeCheckoutStatus({ token, language, status, cancel, cartID, orderURL }: Props) {
  const router = useRouter()
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState(false)
  const pending = status === 'pending' || status === 'processing'
  const canCancel = cancel && status === 'pending'
  const text = (value: Parameters<typeof adminText>[0]) => adminText(value, language)

  useEffect(() => {
    if (!orderURL) return

    try {
      if (cartID && localStorage.getItem(cartStorageKey) === String(cartID)) {
        localStorage.removeItem(cartStorageKey)
        localStorage.removeItem(`${cartStorageKey}_secret`)
      }
    } finally {
      window.location.replace(orderURL)
    }
  }, [cartID, orderURL])

  useEffect(() => {
    if (!pending || cancel) return

    const poll = window.setInterval(() => router.refresh(), 3000)
    const stop = window.setTimeout(() => window.clearInterval(poll), 30000)
    return () => {
      window.clearInterval(poll)
      window.clearTimeout(stop)
    }
  }, [pending, cancel, router])

  async function cancelPayment() {
    setCancelling(true)
    setCancelError(false)
    try {
      const response = await fetch('/api/payments/stripe/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (!response.ok) throw new Error('Unable to cancel Stripe Checkout.')
      router.replace('/checkout')
    } catch {
      setCancelError(true)
      router.refresh()
      setCancelling(false)
    }
  }

  return (
    <div className="container min-h-[70vh] py-12 flex flex-col items-center gap-4 text-center">
      <h1 className="text-2xl">{text('Payment status')}</h1>
      <p role="status">
        {text(
          orderURL
            ? 'Payment confirmed.'
            : canCancel
              ? 'This payment session is still open.'
              : pending
                ? 'Payment is pending. Your order will be confirmed after Stripe verifies the payment.'
                : 'This payment session is no longer available.',
        )}
      </p>
      {cancelError && <p role="alert">{text('The payment session could not be cancelled.')}</p>}
      <div className="flex flex-wrap justify-center gap-3">
        {canCancel && (
          <Button disabled={cancelling} onClick={() => void cancelPayment()}>
            {text('Cancel payment session')}
          </Button>
        )}
        {pending && !canCancel && (
          <Button onClick={() => router.refresh()}>{text('Check payment status')}</Button>
        )}
        {orderURL ? (
          <Button asChild>
            <a href={orderURL}>{text('View order')}</a>
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href="/checkout">{text('Return to checkout')}</Link>
          </Button>
        )}
      </div>
    </div>
  )
}
