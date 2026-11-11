import type { Metadata } from 'next'

import config from '@payload-config'
import { headers } from 'next/headers'
import { getPayload } from 'payload'
import { Suspense } from 'react'

import { ConfirmOrder } from '@/components/checkout/ConfirmOrder'
import { StripeCheckoutStatus } from '@/components/checkout/StripeCheckoutStatus'
import { findCheckout, getCheckoutOrderURL } from '@/payments/checkoutEndpoints'
import { relationshipID } from '@/payments/settleCheckout'
import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function ConfirmOrderPage({ searchParams }: { searchParams: SearchParams }) {
  const { checkout, cancel } = await searchParams

  if (typeof checkout === 'string') {
    const requestHeaders = await headers()
    const language = requestHeaders.get('accept-language')?.split(',')[0] ?? 'pt'
    const payload = await getPayload({ config })
    const transaction = await findCheckout(payload, checkout)
    const orderID = relationshipID(transaction?.order)
    const orderURL =
      transaction?.status === 'succeeded' && orderID
        ? await getCheckoutOrderURL(payload, orderID)
        : undefined

    return (
      <StripeCheckoutStatus
        token={checkout}
        language={language}
        status={transaction?.status}
        cancel={cancel === '1'}
        cartID={relationshipID(transaction?.cart)}
        orderURL={orderURL}
      />
    )
  }

  return (
    <div className="container min-h-[90vh] flex py-12">
      <Suspense>
        <ConfirmOrder />
      </Suspense>
    </div>
  )
}

export const metadata: Metadata = {
  description: 'Confirm order.',
  openGraph: mergeOpenGraph({
    title: 'Confirming order',
    url: '/checkout/confirm-order',
  }),
  title: 'Confirming order',
  referrer: 'no-referrer',
}
