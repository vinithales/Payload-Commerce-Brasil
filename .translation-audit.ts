import config from './src/payload.config'
const c = await config
const pending = new Set<string>()
function visit(x: unknown) {
 if (!x || typeof x !== 'object') return
 if (Array.isArray(x)) { x.forEach(visit); return }
 const obj = x as Record<string, unknown>
 for (const [key, value] of Object.entries(obj)) {
   if (['label','singular','plural','description','placeholder','group'].includes(key) && typeof value === 'string') pending.add(value)
   if (['fields','tabs','blocks','options','labels','admin'].includes(key)) visit(value)
 }
}
c.collections.forEach(visit)
c.globals.forEach(visit)
console.log(JSON.stringify([...pending].sort()))
