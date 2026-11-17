import { createError } from 'h3'
import { z } from 'zod'
import { modelIdSchema, type CatalogModel, type ModelSelection } from '#shared/models'
import type { ProviderConfig } from '../ai/assistant'

const strings = z.array(z.string().max(80)).max(80).catch([])
const remoteModel = z.object({
  id: modelIdSchema,
  name: z.string().trim().max(300).catch(''),
  description: z.string().catch(''),
  context_length: z.number().int().nonnegative().catch(0),
  architecture: z.object({ input_modalities: strings, output_modalities: strings }).catch({ input_modalities: [], output_modalities: [] }),
  supported_parameters: strings,
  pricing: z.record(z.string(), z.unknown()).catch({}),
})
const responseSchema = z.object({ data: z.array(z.unknown()) })
export const catalogQuerySchema = z.object({
  q: z.string().trim().max(200).default(''),
  pricing: z.enum(['all', 'free', 'paid']).default('all'),
  compatibility: z.enum(['all', 'compatible', 'incompatible']).default('all'),
  page: z.preprocess(value => typeof value === 'string' ? Number(value) : value, z.number().int().positive().safe()).default(1),
}).strict()
type CatalogSnapshot = { items: CatalogModel[]; updatedAt: string; stale: boolean }
let cached: CatalogSnapshot | undefined
let inFlight: Promise<CatalogSnapshot> | undefined
let retryAfter = 0
const unavailable = () => createError({ statusCode: 503, statusMessage: 'Catálogo de modelos indisponível. Tente novamente.' })

function price(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value).trim()
  return /^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text) && Number.isFinite(Number(text)) ? text : null
}

function reduceModel(value: unknown): CatalogModel | null {
  const parsed = remoteModel.safeParse(value)
  if (!parsed.success) return null
  const model = parsed.data
  const promptPrice = price(model.pricing.prompt)
  const completionPrice = price(model.pricing.completion)
  const zero = (text: string) => !/[1-9]/.test(text.split(/e/i)[0]!)
  const charges = Object.entries(model.pricing).map(([field, value]) => [field, price(value)] as const)
  const paid = charges.some(([, charge]) => charge !== null && !zero(charge))
  const free = promptPrice !== null && completionPrice !== null && charges.every(([, charge]) => charge !== null && zero(charge))
  return {
    id: model.id, name: model.name || model.id,
    description: model.description.replace(/\s+/g, ' ').trim().slice(0, 240),
    cost: paid ? 'paid' : free ? 'free' : 'unknown',
    promptPrice, completionPrice, contextLength: model.context_length,
    inputModalities: model.architecture.input_modalities,
    outputModalities: model.architecture.output_modalities,
    hasAdditionalCosts: charges.some(([field, charge]) => field !== 'prompt' && field !== 'completion' && charge !== null && !zero(charge)),
    compatible: model.architecture.output_modalities.includes('text') && model.supported_parameters.includes('tools'),
  }
}

async function fetchCatalog(): Promise<CatalogSnapshot> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models?output_modalities=all', {
      headers: { Accept: 'application/json' }, redirect: 'error', signal: controller.signal,
    })
    if (!response.ok) throw new Error('CATALOG_UNAVAILABLE')
    const data = responseSchema.parse(await response.json())
    const models = data.data.map(reduceModel).filter((model): model is CatalogModel => model !== null)
    const items = [...new Map(models.map(model => [model.id, model])).values()].sort((a, b) =>
      Number(b.cost === 'free') - Number(a.cost === 'free') || a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }) || a.id.localeCompare(b.id))
    cached = { items, updatedAt: new Date().toISOString(), stale: false }
    retryAfter = 0
    return cached
  } finally { clearTimeout(timeout) }
}

export function getModelCatalog(): Promise<CatalogSnapshot> {
  if (cached && Date.now() - Date.parse(cached.updatedAt) < 30 * 60_000) return Promise.resolve(cached)
  if (Date.now() < retryAfter) return cached ? Promise.resolve({ ...cached, stale: true }) : Promise.reject(unavailable())
  if (!inFlight) inFlight = fetchCatalog().catch(() => {
    retryAfter = Date.now() + 30_000
    if (cached) return { ...cached, stale: true }
    throw unavailable()
  }).finally(() => { inFlight = undefined })
  return inFlight
}

export function catalogPage(catalog: CatalogSnapshot, query: z.infer<typeof catalogQuerySchema>) {
  const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR')
  const search = normalize(query.q)
  const matches = catalog.items.filter(model => (query.pricing === 'all' || model.cost === query.pricing)
    && (query.compatibility === 'all' || model.compatible === (query.compatibility === 'compatible'))
    && normalize(`${model.name} ${model.id}`).includes(search))
  return { ...catalog, items: matches.slice((query.page - 1) * 40, query.page * 40), total: matches.length, page: query.page, pageSize: 40 }
}

export async function resolveProviderConfig(config: ProviderConfig, selection: ModelSelection | undefined, deadlineAt: number): Promise<ProviderConfig> {
  if (!selection) return { openrouterApiKey: config.openrouterApiKey, openrouterModel: config.openrouterModel, openrouterFallbackModel: config.openrouterFallbackModel }
  const provider = { openrouterApiKey: config.openrouterApiKey, openrouterModel: selection.primary, openrouterFallbackModel: selection.fallback ?? '' }
  let timer: ReturnType<typeof setTimeout> | undefined
  const catalog = await Promise.race([
    getModelCatalog().catch(() => null),
    new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), Math.max(0, Math.min(10_000, deadlineAt - Date.now()))) }),
  ]).finally(() => { clearTimeout(timer) })
  if (catalog && [selection.primary, selection.fallback].some(id => id && catalog.items.some(model => model.id === id && !model.compatible))) {
    throw createError({ statusCode: 422, statusMessage: 'O modelo selecionado não oferece saída de texto e ferramentas.' })
  }
  return provider
}
