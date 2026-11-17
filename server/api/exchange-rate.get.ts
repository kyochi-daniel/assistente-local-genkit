import { createError, defineEventHandler, getHeader, getQuery, setHeader } from 'h3'
import { useRuntimeConfig } from '#imports'
import { assertOrigin, requireSession } from '../utils/auth'
import { getExchangeRate } from '../utils/exchange-rate'

export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const config = useRuntimeConfig(event)
  if (getHeader(event, 'origin') !== undefined) assertOrigin(event, config)
  await requireSession(event, config)
  if (Object.keys(getQuery(event)).length) throw createError({ statusCode: 400, statusMessage: 'A consulta de cotação não aceita parâmetros.' })
  return getExchangeRate()
})
