import type { Product, Variant } from '@/payload-types'

export function getCartItemPrices(
  product: Product,
  variant: Variant | number | string | null | undefined,
): {
  regularAmount: number | null | undefined
  promotionalAmount: number | undefined
} {
  if (variant && typeof variant === 'object') {
    return {
      regularAmount: variant.priceInUSD,
      promotionalAmount: undefined,
    }
  }

  if (typeof variant === 'number') {
    return {
      regularAmount: product.priceInUSD,
      promotionalAmount: undefined,
    }
  }

  const promotionalPrice = product.promotionalPriceInUSD

  return {
    regularAmount: product.priceInUSD,
    promotionalAmount:
      typeof promotionalPrice === 'number' &&
      Number.isFinite(promotionalPrice) &&
      promotionalPrice >= 0
        ? promotionalPrice
        : undefined,
  }
}
