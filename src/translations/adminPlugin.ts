import type { Field, Plugin } from 'payload'
import { ptBR } from './pt-BR'

const humanize = (name: string) =>
  name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())

function translate<T>(value: T): T {
  if (typeof value !== 'string') return value
  const key = Object.keys(ptBR).find((key) => key.toLowerCase() === value.toLowerCase()) as
    keyof typeof ptBR | undefined
  return (key ? { en: value, pt: ptBR[key] } : value) as T
}

function fields(items: Field[]): Field[] {
  return items.map((field) => {
    const result = { ...field }
    if ('label' in result || 'name' in result) {
      result.label = translate(
        result.label ?? ('name' in result ? humanize(result.name) : undefined),
      )
    }
    if (result.admin && 'description' in result.admin)
      result.admin = { ...result.admin, description: translate(result.admin.description) }
    if ('fields' in result) result.fields = fields(result.fields)
    if (result.type === 'tabs')
      result.tabs = result.tabs.map((tab) => {
        const translated = { ...tab }
        if (translated.label) translated.label = translate(translated.label)
        translated.fields = fields(tab.fields)
        return translated
      })
    if (result.type === 'blocks')
      result.blocks = result.blocks.map((block) =>
        typeof block === 'string'
          ? block
          : {
              ...block,
              labels: {
                singular: translate(block.labels?.singular ?? humanize(block.slug)),
                plural: translate(block.labels?.plural ?? humanize(block.slug)),
              },
              fields: fields(block.fields),
            },
      )
    if (result.type === 'select' || result.type === 'radio')
      result.options = result.options.map((option) =>
        typeof option === 'string'
          ? { value: option, label: translate(humanize(option)) }
          : { ...option, label: translate(option.label) },
      )
    return result
  })
}

// Run after the ecommerce and form plugins so their static labels are covered too.
export const adminTranslationsPlugin: Plugin = (config) => ({
  ...config,
  collections: config.collections?.map((collection) => ({
    ...collection,
    labels: {
      singular: translate(
        collection.labels?.singular ??
          { pages: 'Page', products: 'Product', categories: 'Category', users: 'User' }[
            collection.slug
          ] ??
          humanize(collection.slug),
      ),
      plural: translate(collection.labels?.plural ?? humanize(collection.slug)),
    },
    admin: {
      ...collection.admin,
      group: translate(collection.admin?.group),
      description: translate(collection.admin?.description),
    },
    fields: fields(collection.fields),
  })),
  globals: config.globals?.map((global) => ({
    ...global,
    label: translate(global.label ?? humanize(global.slug)),
    fields: fields(global.fields),
  })),
})
