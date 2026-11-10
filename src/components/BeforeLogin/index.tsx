'use client'

import { useTranslation } from '@payloadcms/ui'
import { adminText } from '@/translations'

export const BeforeLogin = () => {
  const { i18n } = useTranslation()
  return (
    <div>
      <p>
        <b>{adminText('Welcome to your dashboard!', i18n.language)}</b>
      </p>
      <p>{adminText('Store administrators can sign in here.', i18n.language)}</p>
      <a href="/login">{adminText('Customer sign in', i18n.language)}</a>
    </div>
  )
}
