import { createError } from 'h3'
import { z } from 'zod'
import type { ExchangeRate } from '#shared/models'

const quoteSchema = z.object({
  USDBRL: z.object({
    code: z.literal('USD'), codein: z.literal('BRL'),
    ask: z.union([z.string().regex(/^\d+(?:\.\d+)?$/).transform(Number), z.number()]).pipe(z.number().finite().positive()),
    timestamp: z.union([z.string().regex(/^\d+$/).transform(Number), z.number()]).pipe(z.number().int().positive().safe()),
  }),
})
const MAX_AGE = 7 * 24 * 60 * 60_000
let cached: ExchangeRate | undefined
let inFlight: Promise<ExchangeRate> | undefined
let retryAfter = 0
const unavailable = () => createError({ statusCode: 503, statusMessage: 'Cotação USD/BRL indisponível. Tente novamente.' })
const quoteIsRecent = (timestamp: number) => timestamp <= Date.now() + 5 * 60_000 && Date.now() - timestamp <= MAX_AGE
const cachedRate = () => cached && quoteIsRecent(Date.parse(cached.quotedAt)) ? cached : undefined
const withAge = (quote: ExchangeRate): ExchangeRate => ({ ...quote, stale: Date.now() - Date.parse(quote.quotedAt) > 24 * 60 * 60_000 })

async function fetchRate(): Promise<ExchangeRate> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL', {
      headers: { Accept: 'application/json' }, redirect: 'error', signal: controller.signal,
    })
    if (!response.ok) throw new Error('EXCHANGE_RATE_UNAVAILABLE')
    const { USDBRL } = quoteSchema.parse(await response.json())
    const timestamp = USDBRL.timestamp * 1000
    if (!quoteIsRecent(timestamp)) throw new Error('INVALID_QUOTE_DATE')
    cached = withAge({ rate: USDBRL.ask, quotedAt: new Date(timestamp).toISOString(), fetchedAt: new Date().toISOString(), source: 'AwesomeAPI', stale: false })
    retryAfter = 0
    return cached
  } finally { clearTimeout(timeout) }
}

export function getExchangeRate(): Promise<ExchangeRate> {
  const previous = cachedRate()
  if (previous && Date.now() - Date.parse(previous.fetchedAt) < 60_000) return Promise.resolve(withAge(previous))
  if (Date.now() < retryAfter) return previous ? Promise.resolve({ ...previous, stale: true }) : Promise.reject(unavailable())
  if (!inFlight) inFlight = fetchRate().catch(() => {
    retryAfter = Date.now() + 30_000
    const last = cachedRate()
    if (last) return { ...last, stale: true }
    throw unavailable()
  }).finally(() => { inFlight = undefined })
  return inFlight
}
