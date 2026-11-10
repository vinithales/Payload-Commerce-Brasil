'use client'

import { Button } from '@/components/ui/button'
import { QuantityInput } from '@/components/product/QuantityInput'
import type { Product, Variant } from '@/payload-types'

import { useCart } from '@payloadcms/plugin-ecommerce/client/react'
import clsx from 'clsx'
import { useSearchParams } from 'next/navigation'
import React, { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
type Props = {
  product: Product
}

export function AddToCart({ product }: Props) {
  const { addItem, cart, isLoading } = useCart()
  const searchParams = useSearchParams()

  const variants = product.variants?.docs || []

  const selectedVariant = useMemo<Variant | undefined>(() => {
    if (product.enableVariants && variants.length) {
      const variantId = searchParams.get('variant')

      const validVariant = variants.find((variant) => {
        if (typeof variant === 'object') {
          return String(variant.id) === variantId
        }
        return String(variant) === variantId
      })

      if (validVariant && typeof validVariant === 'object') {
        return validVariant
      }
    }

    return undefined
  }, [product.enableVariants, searchParams, variants])

  const selectionKey = `${product.id}:${selectedVariant?.id ?? ''}`
  const [selection, setSelection] = useState({ key: selectionKey, quantity: 1 })
  const existingItem = cart?.items?.find((item) => {
    const productID = typeof item.product === 'object' ? item.product?.id : item.product
    const variantID = typeof item.variant === 'object' ? item.variant?.id : item.variant
    return (
      productID === product.id && (!product.enableVariants || variantID === selectedVariant?.id)
    )
  })
  const inventory = product.enableVariants ? selectedVariant?.inventory : product.inventory
  const availableQuantity = Math.max(0, (inventory ?? 0) - (existingItem?.quantity ?? 0))
  const quantity = Math.max(
    1,
    Math.min(availableQuantity, selection.key === selectionKey ? selection.quantity : 1),
  )
  const disabled =
    isLoading || availableQuantity < 1 || Boolean(product.enableVariants && !selectedVariant)

  const addToCart = useCallback(
    (e: React.FormEvent<HTMLButtonElement>) => {
      e.preventDefault()
      if (disabled) return

      addItem(
        {
          product: product.id,
          variant: selectedVariant?.id ?? undefined,
        },
        quantity,
      )
        .then(() => {
          toast.success('Item added to cart.')
        })
        .catch(() => {
          toast.error('Unable to add item to cart. Please try again.')
        })
    },
    [addItem, product, selectedVariant, quantity, disabled],
  )

  return (
    <div className="flex flex-wrap items-center gap-3">
      <QuantityInput
        key={selectionKey}
        disabled={disabled}
        max={availableQuantity}
        onChange={(quantity) => setSelection({ key: selectionKey, quantity })}
        value={quantity}
      />
      <Button
        aria-label="Add to cart"
        variant={'outline'}
        className={clsx({
          'min-h-12 rounded-full px-6': true,
          'hover:opacity-90': true,
        })}
        disabled={disabled || isLoading}
        onClick={addToCart}
        type="button"
      >
        Add To Cart
      </Button>
    </div>
  )
}
