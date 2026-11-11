import { ecommercePlugin } from '@payloadcms/plugin-ecommerce'
import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types'
import { FixedToolbarFeature, HeadingFeature, lexicalEditor } from '@payloadcms/richtext-lexical'
import { Plugin } from 'payload'

import { adminOnlyFieldAccess } from '@/access/adminOnlyFieldAccess'
import { adminOrPublishedStatus } from '@/access/adminOrPublishedStatus'
import { customerOnlyFieldAccess } from '@/access/customerOnlyFieldAccess'
import { isAdmin } from '@/access/isAdmin'
import { isDocumentOwner } from '@/access/isDocumentOwner'
import { ProductsCollection } from '@/collections/Products'
import { Page, Product, Variant } from '@/payload-types'
import { checkoutCurrencyFields } from '@/payments/fields'
import { stripeCheckout } from '@/payments/stripeCheckout'
import { adminTranslationsPlugin } from '@/translations/adminPlugin'
import { getCartItemPrices } from '@/utilities/getCartItemPrices'
import { getServerSideURL } from '@/utilities/getURL'

const generateTitle: GenerateTitle<Product | Page> = ({ doc }) => {
  return doc?.title ? `${doc.title} | Payload Ecommerce Template` : 'Payload Ecommerce Template'
}

const generateURL: GenerateURL<Product | Page> = ({ doc }) => {
  const url = getServerSideURL()

  return doc?.slug ? `${url}/${doc.slug}` : url
}

export const plugins: Plugin[] = [
  seoPlugin({
    generateTitle,
    generateURL,
  }),
  formBuilderPlugin({
    fields: {
      payment: false,
    },
    formSubmissionOverrides: {
      access: {
        delete: isAdmin,
        read: isAdmin,
        update: isAdmin,
      },
      admin: {
        group: 'Content',
      },
    },
    formOverrides: {
      access: {
        delete: isAdmin,
        read: isAdmin,
        update: isAdmin,
        create: isAdmin,
      },
      admin: {
        group: 'Content',
      },
      fields: ({ defaultFields }) => {
        return defaultFields.map((field) => {
          if ('name' in field && field.name === 'confirmationMessage') {
            return {
              ...field,
              editor: lexicalEditor({
                features: ({ rootFeatures }) => {
                  return [
                    ...rootFeatures,
                    FixedToolbarFeature(),
                    HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
                  ]
                },
              }),
            }
          }
          return field
        })
      },
    },
  }),
  ecommercePlugin({
    access: {
      adminOnlyFieldAccess,
      adminOrPublishedStatus,
      customerOnlyFieldAccess,
      isAdmin,
      isDocumentOwner,
    },
    customers: {
      slug: 'users',
    },
    orders: {
      ordersCollectionOverride: ({ defaultCollection }) => ({
        ...defaultCollection,
        fields: [
          ...checkoutCurrencyFields(defaultCollection.fields),
          {
            name: 'accessToken',
            type: 'text',
            unique: true,
            index: true,
            admin: {
              position: 'sidebar',
              readOnly: true,
            },
            hooks: {
              beforeValidate: [
                ({ value, operation }) => {
                  if (operation === 'create' || !value) {
                    return crypto.randomUUID()
                  }
                  return value
                },
              ],
            },
          },
        ],
      }),
    },
    payments: {
      paymentMethods: [stripeCheckout],
    },
    transactions: {
      transactionsCollectionOverride: ({ defaultCollection }) => ({
        ...defaultCollection,
        fields: checkoutCurrencyFields(defaultCollection.fields),
      }),
    },
    products: {
      productsCollectionOverride: ProductsCollection,
    },
    carts: {
      cartsCollectionOverride: ({ defaultCollection }) => ({
        ...defaultCollection,
        hooks: {
          ...defaultCollection.hooks,
          beforeChange: [
            ...(defaultCollection.hooks?.beforeChange ?? []),
            async ({ data, originalDoc, req }) => {
              const items = data.items ?? originalDoc?.items ?? []
              let subtotal = 0

              for (const item of items) {
                if (!item.product) throw new Error('Cart item is missing product reference')
                const productId = typeof item.product === 'object' ? item.product.id : item.product
                const product = await req.payload.findByID({
                  collection: 'products',
                  id: productId,
                  depth: 0,
                  req,
                })

                if (!product) throw new Error('Product not found')

                let variant: Variant | undefined

                if (item.variant) {
                  if (!product.enableVariants) {
                    throw new Error('Product does not have variants enabled')
                  }
                  const variantId =
                    typeof item.variant === 'object' ? item.variant.id : item.variant

                  variant = await req.payload.findByID({
                    collection: 'variants',
                    id: variantId,
                    depth: 0,
                    req,
                  })
                }

                const { regularAmount, promotionalAmount } = getCartItemPrices(product, variant)
                const unitPrice = promotionalAmount ?? regularAmount

                if (typeof unitPrice !== 'number' || !Number.isFinite(unitPrice)) {
                  throw new Error('Invalid cart item price')
                }

                subtotal += unitPrice * item.quantity
              }
              data.subtotal = subtotal

              return data
            },
          ],
        },
      }),
    },
  }),
  adminTranslationsPlugin,
]
