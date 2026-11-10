import { ptBR } from './pt-BR'

// Payload uses "pt" as its Portuguese admin language key.
export const adminLabel = (text: keyof typeof ptBR) => ({ en: text, pt: ptBR[text] })

export const adminText = (text: keyof typeof ptBR, language: string) =>
  language.startsWith('pt') ? ptBR[text] : text
