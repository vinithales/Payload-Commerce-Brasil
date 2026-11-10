'use client'

import { Banner, useTranslation } from '@payloadcms/ui'
import { adminText } from '@/translations'
import { SeedButton } from './SeedButton'
import './index.scss'

export const BeforeDashboard = () => {
  const { i18n } = useTranslation()
  return (
    <div className="before-dashboard">
      <Banner className="before-dashboard__banner" type="success">
        <h4>{adminText('Welcome to your dashboard!', i18n.language)}</h4>
      </Banner>
      <p>{adminText('Manage your store using the menu.', i18n.language)}</p>
      <ul className="before-dashboard__instructions">
        <li>
          <a href="/">{adminText('Visit your website', i18n.language)}</a>
        </li>
        <li>
          <SeedButton />
        </li>
      </ul>
    </div>
  )
}
