'use client'

import React, { Fragment, useCallback, useState, MouseEvent } from 'react'
import { toast, useTranslation } from '@payloadcms/ui'

import './index.scss'
import { adminText } from '@/translations'

export const SeedButton: React.FC = () => {
  const { i18n } = useTranslation()
  const text = (value: Parameters<typeof adminText>[0]) => adminText(value, i18n.language)
  const [loading, setLoading] = useState(false)
  const [seeded, setSeeded] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const handleClick = useCallback(
    async (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()

      if (seeded) {
        toast.info(text('Database already seeded.'))
        return
      }
      if (loading) {
        toast.info(text('Seeding already in progress.'))
        return
      }
      if (error) {
        toast.error(text('An error occurred, please refresh and try again.'))
        return
      }

      setLoading(true)

      try {
        toast.promise(
          new Promise((resolve, reject) => {
            try {
              fetch('/next/seed', { method: 'POST', credentials: 'include' })
                .then((res) => {
                  if (res.ok) {
                    resolve(true)
                    setSeeded(true)
                  } else {
                    reject(text('An error occurred while seeding.'))
                  }
                })
                .catch((error) => {
                  reject(error)
                })
            } catch (error) {
              reject(error)
            }
          }),
          {
            loading: text('Seeding with data....'),
            success: text('Database seeded!'),
            error: text('An error occurred while seeding.'),
          },
        )
      } catch (err) {
        setError(err)
      }
    },
    [loading, seeded, error, i18n.language],
  )

  let message = ''
  if (loading) message = text(' (seeding...)')
  if (seeded) message = text(' (done!)')
  if (error) message = text('An error occurred while seeding.')

  return (
    <Fragment>
      <button className="seedButton" onClick={handleClick}>
        {text('Seed your database')}
      </button>
      {message}
    </Fragment>
  )
}
