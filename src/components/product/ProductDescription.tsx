'use client'
import type { Product, Variant } from '@/payload-types'

import { AddToCart } from '@/components/Cart/AddToCart'
import { Price } from '@/components/Price'
import { RichText } from '@/components/RichText'
import { Suspense } from 'react'

import { StockIndicator } from '@/components/product/StockIndicator'
import { useCurrency } from '@payloadcms/plugin-ecommerce/client/react'
import { VariantSelector } from './VariantSelector'

export function ProductDescription({ product }: { product: Product }) {
  const { currency } = useCurrency()
  let amount = 0,
    lowestAmount = 0,
    highestAmount = 0
  const priceField = `priceIn${currency.code}` as keyof Product
  const hasVariants = product.enableVariants && Boolean(product.variants?.docs?.length)
  const promotionalAmount = product.promotionalPriceInUSD
  const hasPromotion =
    !hasVariants && currency.code === 'USD' && typeof promotionalAmount === 'number'

  if (hasVariants) {
    const priceField = `priceIn${currency.code}` as keyof Variant
    const variantPrices = (product.variants?.docs ?? [])
      .filter((variant): variant is Variant => Boolean(variant) && typeof variant === 'object')
      .map((variant) => variant[priceField])
      .filter((price): price is number => typeof price === 'number')

    if (variantPrices.length) {
      lowestAmount = Math.min(...variantPrices)
      highestAmount = Math.max(...variantPrices)
    }
  } else if (product[priceField] && typeof product[priceField] === 'number') {
    amount = product[priceField]
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-medium">{product.title}</h1>
          {product.sku && (
            <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
          )}
        </div>

        <div className="flex items-baseline gap-2 uppercase font-mono">
          {hasPromotion ? (
            <>
              {amount > 0 && (
                <Price
                  amount={amount}
                  as="span"
                  className="text-sm text-muted-foreground line-through"
                />
              )}
              <Price
                amount={promotionalAmount}
                as="span"
                className="text-xl font-semibold"
              />
            </>
          ) : hasVariants ? (
            <Price highestAmount={highestAmount} lowestAmount={lowestAmount} />
          ) : (
            <Price amount={amount} />
          )}
        </div>
      </div>

      {product.description ? (
        <RichText className="" data={product.description} enableGutter={false} />
      ) : null}
      <hr />
      {hasVariants && (
        <>
          <Suspense fallback={null}>
            <VariantSelector product={product} />
          </Suspense>

          <hr />
        </>
      )}
      <div className="flex items-center justify-between">
        <Suspense fallback={null}>
          <StockIndicator product={product} />
        </Suspense>
      </div>

      <div className="flex items-center justify-between">
        <Suspense fallback={null}>
          <AddToCart product={product} />
        </Suspense>
      </div>
    </div>
  )
}
