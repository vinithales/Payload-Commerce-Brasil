import type { Field } from 'payload'
import type { CurrenciesConfig } from '@payloadcms/plugin-ecommerce/types'

import { adminLabel } from '@/translations'

const checkoutCurrencies: CurrenciesConfig = {
  defaultCurrency: 'USD',
  supportedCurrencies: [
    { code: 'USD', decimals: 2, label: 'USD', symbol: '$' },
    { code: 'BRL', decimals: 2, label: 'BRL', symbol: 'R$' },
  ],
}

export function checkoutCurrencyFields(fields: Field[]): Field[] {
  return fields.map((field) => {
    if (field.type === 'row') return { ...field, fields: checkoutCurrencyFields(field.fields) }
    if (field.type === 'number' && field.name === 'amount') {
      return {
        ...field,
        admin: {
          ...field.admin,
          components: {
            ...field.admin?.components,
            Cell: '@/components/checkout/PaymentAmountCell#PaymentAmountCell',
            Field: {
              path: '@payloadcms/plugin-ecommerce/rsc#PriceInput',
              clientProps: { currenciesConfig: checkoutCurrencies },
            },
          },
        },
      }
    }
    if (field.type !== 'select' || field.name !== 'currency') return field

    return {
      ...field,
      admin: { ...field.admin, readOnly: false },
      options: [...field.options, { label: 'BRL', value: 'BRL' }],
    }
  })
}

export const stripeCheckoutFields: Field[] = [
  {
    name: 'checkoutSessionID',
    type: 'text',
    label: adminLabel('Checkout session ID'),
    unique: true,
    admin: { readOnly: true },
  },
  { name: 'checkoutCartKey', type: 'text', unique: true, admin: { hidden: true } },
  { name: 'checkoutToken', type: 'text', unique: true, admin: { hidden: true } },
  { name: 'checkoutSnapshot', type: 'json', admin: { hidden: true } },
]
