'use client'

import { useTranslation } from '@payloadcms/ui'
import type { DefaultCellComponentProps } from 'payload'

export function PaymentAmountCell({ cellData, rowData }: DefaultCellComponentProps) {
  const { i18n } = useTranslation()
  if (typeof cellData !== 'number') return null

  return new Intl.NumberFormat(i18n.language, {
    style: 'currency',
    currency: rowData.currency === 'BRL' ? 'BRL' : 'USD',
  }).format(cellData / 100)
}
