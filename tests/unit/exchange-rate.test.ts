import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const now = new Date('2026-11-14T15:00:00.000Z').getTime()
const day = 24 * 60 * 60_000
const data = (changes: Record<string, unknown> = {}) => ({ USDBRL: { code: 'USD', codein: 'BRL', ask: '5.4321', bid: '5.1234', timestamp: String((now - 60_000) / 1000), ...changes } })
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(now) })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('cotação pública USD/BRL sem chave ou inferência', () => {
  it('usa ASK de venda e preserva a hora UTC da cotação separada da coleta', async () => {
    const fetchMock = vi.fn(async () => response(data()))
    vi.stubGlobal('fetch', fetchMock)
    const { getExchangeRate } = await import('../../server/utils/exchange-rate')
    expect(await getExchangeRate()).toEqual({ rate: 5.4321, quotedAt: '2026-11-14T14:59:00.000Z', fetchedAt: '2026-11-14T15:00:00.000Z', source: 'AwesomeAPI', stale: false })
    expect(fetchMock).toHaveBeenCalledWith('https://economia.awesomeapi.com.br/json/last/USD-BRL', { headers: { Accept: 'application/json' }, redirect: 'error', signal: expect.any(AbortSignal) })
  })
  it('compartilha fetch concorrente e mantém cache por sessenta segundos', async () => {
    let complete!: (result: Response) => void
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve })).mockResolvedValueOnce(response(data({ ask: '5.5' })))
    vi.stubGlobal('fetch', fetchMock)
    const { getExchangeRate } = await import('../../server/utils/exchange-rate')
    const first = getExchangeRate()
    expect(getExchangeRate()).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    complete(response(data()))
    await first
    await vi.advanceTimersByTimeAsync(59_999)
    expect((await getExchangeRate()).rate).toBe(5.4321)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect((await getExchangeRate()).rate).toBe(5.5)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('interrompe fetch após cinco segundos e retorna somente erro seguro', async () => {
    let signal!: AbortSignal
    const fetchMock = vi.fn((_, options: RequestInit) => new Promise((_, reject) => {
      signal = options.signal!
      signal.addEventListener('abort', () => reject(new Error('conteúdo privado remoto')), { once: true })
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { getExchangeRate } = await import('../../server/utils/exchange-rate')
    const failed = expect(getExchangeRate()).rejects.toMatchObject({ statusCode: 503, statusMessage: 'Cotação USD/BRL indisponível. Tente novamente.' })
    await vi.advanceTimersByTimeAsync(5000)
    await failed
    expect(signal.aborted).toBe(true)
    await expect(getExchangeRate()).rejects.toMatchObject({ statusCode: 503 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('usa o último cache válido em falha e aguarda trinta segundos antes de tentar novamente', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(data())).mockRejectedValueOnce(new Error('sem conexão')).mockResolvedValueOnce(response(data({ ask: '5.6' })))
    vi.stubGlobal('fetch', fetchMock)
    const { getExchangeRate } = await import('../../server/utils/exchange-rate')
    const initial = await getExchangeRate()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await getExchangeRate()).toEqual({ ...initial, stale: true })
    await vi.advanceTimersByTimeAsync(29_999)
    expect(await getExchangeRate()).toEqual({ ...initial, stale: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect((await getExchangeRate()).rate).toBe(5.6)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
  it('mantém backoff sem cache e recupera quando o provedor volta', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('erro remoto', { status: 503 })).mockResolvedValueOnce(response(data()))
    vi.stubGlobal('fetch', fetchMock)
    const { getExchangeRate } = await import('../../server/utils/exchange-rate')
    await expect(getExchangeRate()).rejects.toMatchObject({ statusCode: 503 })
    await expect(getExchangeRate()).rejects.toMatchObject({ statusCode: 503 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(30_000)
    expect((await getExchangeRate()).rate).toBe(5.4321)
  })
  it('marca cotação acima de 24h como defasada mesmo quando a coleta é nova', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(data({ timestamp: String((now - day - 1000) / 1000) }))))
    const { getExchangeRate } = await import('../../server/utils/exchange-rate')
    const quote = await getExchangeRate()
    expect(quote.stale).toBe(true)
    expect(quote.fetchedAt).toBe(new Date(now).toISOString())
    expect(quote.quotedAt).toBe(new Date(now - day - 1000).toISOString())
  })
  it('reavalia idade da cotação dentro do cache de sessenta segundos', async () => {
    const fetchMock = vi.fn(async () => response(data({ timestamp: String((now - day) / 1000) })))
    vi.stubGlobal('fetch', fetchMock)
    const { getExchangeRate } = await import('../../server/utils/exchange-rate')
    expect((await getExchangeRate()).stale).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    expect((await getExchangeRate()).stale).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('não reutiliza cache quando a cotação ultrapassa sete dias', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(data({ timestamp: String((now - 7 * day) / 1000) }))).mockRejectedValueOnce(new Error('sem conexão'))
    vi.stubGlobal('fetch', fetchMock)
    const { getExchangeRate } = await import('../../server/utils/exchange-rate')
    expect((await getExchangeRate()).stale).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(getExchangeRate()).rejects.toMatchObject({ statusCode: 503 })
  })
  it('não substitui cache válido por resposta inválida', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(data())).mockResolvedValueOnce(response(data({ ask: '0' })))
    vi.stubGlobal('fetch', fetchMock)
    const { getExchangeRate } = await import('../../server/utils/exchange-rate')
    const first = await getExchangeRate()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await getExchangeRate()).toEqual({ ...first, stale: true })
  })
  it.each([
    { code: 'EUR' }, { codein: 'USD' }, { ask: '0' }, { ask: '-1' }, { ask: 'Infinity' }, { ask: '1e309' },
    { ask: '' }, { ask: null }, { ask: true }, { timestamp: 'inválido' }, { timestamp: '1.5' }, { timestamp: -1 },
    { timestamp: String((now + 301_000) / 1000) }, { timestamp: String((now - 7 * day - 1000) / 1000) },
  ])('recusa par, ASK ou timestamp inválido: %j', async changes => {
    vi.stubGlobal('fetch', vi.fn(async () => response(data(changes))))
    const { getExchangeRate } = await import('../../server/utils/exchange-rate')
    await expect(getExchangeRate()).rejects.toMatchObject({ statusCode: 503, statusMessage: 'Cotação USD/BRL indisponível. Tente novamente.' })
  })
  it('aceita no máximo cinco minutos de diferença futura no timestamp', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(data({ timestamp: String((now + 300_000) / 1000), ask: 5.25 }))))
    const { getExchangeRate } = await import('../../server/utils/exchange-rate')
    expect(await getExchangeRate()).toMatchObject({ rate: 5.25, quotedAt: new Date(now + 300_000).toISOString(), stale: false })
  })
  it.each([{}, { USDJPY: data().USDBRL }, { USDBRL: null }])('recusa estrutura sem o par USDBRL: %j', async body => {
    vi.stubGlobal('fetch', vi.fn(async () => response(body)))
    const { getExchangeRate } = await import('../../server/utils/exchange-rate')
    await expect(getExchangeRate()).rejects.toMatchObject({ statusCode: 503 })
  })
})
