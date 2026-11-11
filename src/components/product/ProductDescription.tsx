'use client'
import type { Product, Variant } from '@/payload-types'

import { AddToCart } from '@/components/Cart/AddToCart'
import { Price } from '@/components/Price'
import { RichText } from '@/components/RichText'
import { Suspense } from 'react'

import { StockIndicator } from '@/components/product/StockIndicator'
import { getCartItemPrices } from '@/utilities/getCartItemPrices'
import { VariantSelector } from './VariantSelector'

export function ProductDescription({ product }: { product: Product }) {
  const hasVariants = product.enableVariants && Boolean(product.variants?.docs?.length)
  const { regularAmount, promotionalAmount } = getCartItemPrices(product, undefined)
  const hasPromotion = !hasVariants && promotionalAmount !== undefined
  const variantPrices = hasVariants
    ? (product.variants?.docs ?? [])
        .filter((variant): variant is Variant => Boolean(variant) && typeof variant === 'object')
        .map((variant) => getCartItemPrices(product, variant).regularAmount)
        .filter((price): price is number => typeof price === 'number')
    : []
  const lowestAmount = variantPrices.length ? Math.min(...variantPrices) : 0
  const highestAmount = variantPrices.length ? Math.max(...variantPrices) : 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-medium">{product.title}</h1>
          {product.sku && <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>}
        </div>

        <div className="flex items-baseline gap-2 uppercase font-mono">
          {hasPromotion ? (
            <>
              {typeof regularAmount === 'number' && (
                <Price
                  amount={regularAmount}
                  as="span"
                  className="text-sm text-muted-foreground line-through"
                />
              )}
              <Price amount={promotionalAmount} as="span" className="text-xl font-semibold" />
            </>
          ) : hasVariants ? (
            <Price highestAmount={highestAmount} lowestAmount={lowestAmount} />
          ) : typeof regularAmount === 'number' ? (
            <Price amount={regularAmount} />
          ) : null}
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
