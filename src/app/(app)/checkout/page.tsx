import type { Metadata } from 'next'

import config from '@payload-config'
import { headers } from 'next/headers'
import { getPayload } from 'payload'

import { CheckoutPage } from '@/components/checkout/CheckoutPage'
import { getStripeSettings } from '@/payments/settings'
import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'

export default async function Checkout() {
  const requestHeaders = await headers()
  const language = requestHeaders.get('accept-language')?.split(',')[0] ?? 'pt'
  const payload = await getPayload({ config })
  const { checkout } = await getStripeSettings(payload)

  return (
    <div className="container min-h-[90vh] flex">
      <h1 className="sr-only">Checkout</h1>
      <CheckoutPage settings={checkout} language={language} />
    </div>
  )
}

export const metadata: Metadata = {
  description: 'Checkout.',
  openGraph: mergeOpenGraph({
    title: 'Checkout',
    url: '/checkout',
  }),
  title: 'Checkout',
}
