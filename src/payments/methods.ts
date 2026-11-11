export const stripeMethods = {
  card: 'Card',
  boleto: 'Boleto',
  pix: 'Pix',
} as const

export type StripeMethod = keyof typeof stripeMethods

export const cartStorageKey = 'cart'

export type CheckoutSettings = {
  methods: StripeMethod[]
  brlExchangeRate: number | null
}

export function quotePayment(method: StripeMethod, usdCents: number, rate: number | null) {
  const currency = method === 'card' ? 'USD' : 'BRL'
  const amount = currency === 'USD' ? usdCents : Math.round(usdCents * (rate ?? 0))

  if (!Number.isSafeInteger(amount) || amount < (method === 'boleto' ? 500 : 50)) return null
  if (method === 'boleto' && amount > 4_999_999) return null

  return { amount, currency } as const
}
