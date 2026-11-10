# Agents

This project uses the Payload CMS skill at `.agents/skills/payload/`.
Start with `.agents/skills/payload/SKILL.md` for a quick reference, then see `.agents/skills/payload/reference/` for detailed docs.

## Language and translations

- Write code identifiers, comments, and source UI text in English.
- Keep Brazilian Portuguese UI translations in `src/translations/pt-BR.ts`; do not hardcode Portuguese in components or collection configuration.
- Use `adminLabel` from `src/translations` for custom Payload admin labels, descriptions, and options. Payload maps these translations to its `pt` language key.
- Keep persisted field names and option values in English and stable when translating labels.
- Apply this convention to all new or modified features.
