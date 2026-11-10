import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddToCart } from '@/components/Cart/AddToCart'
import type { Product } from '@/payload-types'

let root: Root | undefined
const screen = {
  getByRole: (role: string, options?: { name: string }) => {
    const element =
      role === 'spinbutton'
        ? document.querySelector('input[type="number"]')
        : document.querySelector(`button[aria-label="${options?.name}"]`)
    if (!element) throw new Error(`Missing ${role}: ${options?.name ?? ''}`)
    return element
  },
}
const fireEvent = {
  click: (element: Element) => act(() => (element as HTMLButtonElement).click()),
  change: (element: Element, event: { target: { value: string } }) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        element,
        event.target.value,
      )
      element.dispatchEvent(new Event('input', { bubbles: true }))
    }),
  blur: (element: Element) =>
    act(() => element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))),
}
const render = (element: React.ReactNode) => {
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root?.render(element))
  return { rerender: (next: React.ReactNode) => act(() => root?.render(next)) }
}

const state = vi.hoisted(() => ({
  addItem: vi.fn().mockResolvedValue(undefined),
  cart: { items: [] as { product: number; quantity: number }[] },
  params: new URLSearchParams(),
}))

vi.mock('@payloadcms/plugin-ecommerce/client/react', () => ({
  useCart: () => ({ ...state, isLoading: false }),
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => state.params }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const product = { id: 1, inventory: 5, enableVariants: false } as Product

afterEach(() => {
  act(() => root?.unmount())
  document.body.innerHTML = ''
})
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  state.cart.items = []
  state.params = new URLSearchParams()
  state.addItem.mockClear()
})

describe('Product quantity', () => {
  it('adds the selected quantity and respects stock already in the cart', () => {
    state.cart.items = [{ product: 1, quantity: 3 }]
    render(React.createElement(AddToCart, { product }))
    expect(
      (screen.getByRole('button', { name: 'Decrease quantity' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }))
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('2')
    expect(
      (screen.getByRole('button', { name: 'Increase quantity' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }))
    expect(state.addItem).toHaveBeenCalledWith({ product: 1, variant: undefined }, 2)
  })

  it('clamps manual input to a positive whole number within stock', () => {
    render(React.createElement(AddToCart, { product }))
    const input = screen.getByRole('spinbutton') as HTMLInputElement
    for (const [entered, expected] of [
      ['99', '5'],
      ['-2', '1'],
      ['2.8', '2'],
      ['', '1'],
    ]) {
      fireEvent.change(input, { target: { value: entered } })
      fireEvent.blur(input)
      expect(input.value).toBe(expected)
    }
  })

  it('disables purchasing when stock is exhausted', () => {
    render(React.createElement(AddToCart, { product: { ...product, inventory: 0 } }))
    expect((screen.getByRole('spinbutton') as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }))
    expect(state.addItem).not.toHaveBeenCalled()
  })

  it('resets quantity and applies the new stock when the variant changes', () => {
    state.params = new URLSearchParams('variant=10')
    const variantProduct = {
      ...product,
      enableVariants: true,
      variants: {
        docs: [
          { id: 10, inventory: 5 },
          { id: 20, inventory: 1 },
        ],
      },
    } as Product
    const view = render(React.createElement(AddToCart, { product: variantProduct }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }))
    state.params = new URLSearchParams('variant=20')
    view.rerender(React.createElement(AddToCart, { product: variantProduct }))
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('1')
    expect(
      (screen.getByRole('button', { name: 'Increase quantity' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})
