import { createError, defineEventHandler, getHeader, getQuery, setHeader } from 'h3'
import { useRuntimeConfig } from '#imports'
import type { ModelCatalogResponse } from '#shared/models'
import { assertOrigin, requireSession } from '../utils/auth'
import { catalogPage, catalogQuerySchema, getModelCatalog } from '../utils/model-catalog'

export default defineEventHandler(async (event): Promise<ModelCatalogResponse> => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const config = useRuntimeConfig(event)
  if (getHeader(event, 'origin') !== undefined) assertOrigin(event, config)
  await requireSession(event, config)
  const query = catalogQuerySchema.safeParse(getQuery(event))
  if (!query.success) throw createError({ statusCode: 400, statusMessage: 'Consulta de modelos inválida.' })
  return {
    ...catalogPage(await getModelCatalog(), query.data),
    defaults: { primary: config.openrouterModel, fallback: config.openrouterFallbackModel || null },
  }
})
