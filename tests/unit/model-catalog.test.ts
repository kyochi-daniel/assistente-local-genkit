import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { modelIdSchema, modelSelectionSchema } from '#shared/models'

const config = { openrouterApiKey: 'somente-teste', openrouterModel: 'teste/default', openrouterFallbackModel: 'teste/fallback' }
const model = (id: string, extras: Record<string, unknown> = {}) => ({
  id, name: id, context_length: 8192, pricing: { prompt: '0', completion: '0' },
  architecture: { input_modalities: ['text'], output_modalities: ['text'] }, supported_parameters: ['tools'], ...extras,
})
const result = (data: unknown[]) => new Response(JSON.stringify({ data }), { headers: { 'Content-Type': 'application/json' } })
beforeEach(() => { vi.resetModules() })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('contrato da seleção de modelos', () => {
  it('aceita IDs manuais com tag e normaliza apenas espaços nas extremidades', () => {
    expect(modelIdSchema.parse(' baidu/ernie-5.5-flash-preview:free ')).toBe('baidu/ernie-5.5-flash-preview:free')
    expect(modelSelectionSchema.parse({ primary: 'teste/modelo', fallback: null })).toEqual({ primary: 'teste/modelo', fallback: null })
  })
  it.each(['https://host/model', 'teste/modelo com espaço', 'modelo', '/modelo', 'teste/', 'teste/modelo?url=x', 'teste/modelo#fragment', `teste/${'a'.repeat(201)}`])('recusa ID inválido %s', id => {
    expect(modelIdSchema.safeParse(id).success).toBe(false)
  })
  it('recusa chave, endpoint e configurações arbitrárias', () => {
    for (const extra of [{ apiKey: 'não-enviar' }, { baseURL: 'https://externo.example' }, { settings: {} }]) {
      expect(modelSelectionSchema.safeParse({ primary: 'teste/modelo', fallback: null, ...extra }).success).toBe(false)
    }
    expect(modelSelectionSchema.safeParse({ primary: 'teste/modelo' }).success).toBe(false)
  })
})

describe('catálogo público OpenRouter sem inferência', () => {
  it('reduz o payload, ordena gratuitos primeiro e valida modalidades/ferramentas', async () => {
    const fetchMock = vi.fn(async () => result([
      model('teste/pago', { name: 'A pago', pricing: { prompt: '0.001', completion: '0.002' }, description: 'Descrição do provedor.' }),
      model('teste/z-gratis', { name: 'Z gratuito', architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] } }),
      model('teste/a-gratis', { name: 'A gratuito' }),
      model('teste/imagem', { architecture: { input_modalities: ['text'], output_modalities: ['image'] } }),
      model('teste/sem-tools', { supported_parameters: ['tool_choice'] }),
      model('inválido sem barra'),
    ]))
    vi.stubGlobal('fetch', fetchMock)
    const { getModelCatalog } = await import('../../server/utils/model-catalog')
    const catalog = await getModelCatalog()
    expect(catalog.items.map(item => item.id)).toEqual(['teste/a-gratis', 'teste/imagem', 'teste/sem-tools', 'teste/z-gratis', 'teste/pago'])
    expect(catalog.items.find(item => item.id === 'teste/z-gratis')).toMatchObject({ compatible: true, inputModalities: ['text', 'image'], contextLength: 8192 })
    expect(catalog.items.find(item => item.id === 'teste/imagem')?.compatible).toBe(false)
    expect(catalog.items.find(item => item.id === 'teste/sem-tools')?.compatible).toBe(false)
    expect(catalog.items.at(-1)?.description).toBe('Descrição do provedor.')
    expect(fetchMock).toHaveBeenCalledWith('https://openrouter.ai/api/v1/models?output_modalities=all', { headers: { Accept: 'application/json' }, redirect: 'error', signal: expect.any(AbortSignal) })
    expect(catalog.stale).toBe(false)
  })
  it('nunca classifica preço ausente, inválido ou negativo como grátis', async () => {
    const prices = [undefined, null, '', '-1', 'Infinity', '0x0', true]
    vi.stubGlobal('fetch', vi.fn(async () => result([
      ...prices.map((prompt, i) => model(`teste/incerto${i}:free`, { pricing: { prompt, completion: '0' } })),
      model('teste/zero', { pricing: { prompt: '0.000e-20', completion: '0' } }),
      model('teste/positivo', { pricing: { prompt: '1e-999', completion: '0' } }),
    ])))
    const { getModelCatalog } = await import('../../server/utils/model-catalog')
    const { items } = await getModelCatalog()
    expect(items.filter(item => item.id.includes('incerto'))).toHaveLength(prices.length)
    expect(items.filter(item => item.id.includes('incerto')).every(item => item.cost === 'unknown' && item.promptPrice === null)).toBe(true)
    expect(items.find(item => item.id === 'teste/zero')?.cost).toBe('free')
    expect(items.find(item => item.id === 'teste/positivo')?.cost).toBe('paid')
  })
  it('considera encargos de imagem, áudio e requisição sem presumir gratuidade', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => result([
      model('teste/imagem-paga', { pricing: { prompt: '0', completion: '0', image: '0.01' } }),
      model('teste/requisicao-paga', { pricing: { prompt: '0', completion: '0', request: '0.001' } }),
      model('teste/audio-incerto', { pricing: { prompt: '0', completion: '0', audio: null } }),
      model('teste/encargo-negativo', { pricing: { prompt: '0', completion: '0', request: '-1' } }),
      model('teste/pago-com-incerto', { pricing: { prompt: '-1', image: '0.01' } }),
      model('teste/todos-zero', { pricing: { prompt: '0', completion: '0', image: '0', request: '0', audio: '0' } }),
    ])))
    const { getModelCatalog } = await import('../../server/utils/model-catalog')
    const { items } = await getModelCatalog()
    expect(Object.fromEntries(items.map(item => [item.id, item.cost]))).toEqual({
      'teste/imagem-paga': 'paid', 'teste/requisicao-paga': 'paid', 'teste/audio-incerto': 'unknown',
      'teste/encargo-negativo': 'unknown', 'teste/pago-com-incerto': 'paid', 'teste/todos-zero': 'free',
    })
    expect(items.filter(item => item.hasAdditionalCosts).map(item => item.id)).toEqual(['teste/imagem-paga', 'teste/pago-com-incerto', 'teste/requisicao-paga'])
  })
  it('entrega descrição compacta, modalidades reais e custos adicionais para o tooltip', async () => {
    const description = `  Texto\n do\t provedor. ${'Mais detalhes. '.repeat(30)}`
    vi.stubGlobal('fetch', vi.fn(async () => result([
      model('teste/visual', { description, architecture: { input_modalities: ['text', 'image', 'audio'], output_modalities: ['text', 'image'] }, pricing: { prompt: '0.001', completion: '0.002', image: '0.03' } }),
      model('teste/imagem-no-nome'),
      model('teste/sem-descricao', { description: null, pricing: { prompt: '0.001', completion: '0.002', image: 'inválido' } }),
    ])))
    const { getModelCatalog } = await import('../../server/utils/model-catalog')
    const { items } = await getModelCatalog()
    expect(items.find(item => item.id === 'teste/visual')).toMatchObject({
      description: description.replace(/\s+/g, ' ').trim().slice(0, 240),
      inputModalities: ['text', 'image', 'audio'], outputModalities: ['text', 'image'], hasAdditionalCosts: true,
    })
    expect(items.find(item => item.id === 'teste/visual')?.description).toHaveLength(240)
    expect(items.find(item => item.id === 'teste/imagem-no-nome')).toMatchObject({ description: '', inputModalities: ['text'], outputModalities: ['text'], hasAdditionalCosts: false })
    expect(items.find(item => item.id === 'teste/sem-descricao')).toMatchObject({ description: '', hasAdditionalCosts: false })
  })
  it('deduplica IDs e usa dados seguros quando metadados são inválidos', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => result([model('teste/um'), model('teste/um', { name: '', context_length: -1, architecture: null, supported_parameters: null, pricing: null })])))
    const { getModelCatalog } = await import('../../server/utils/model-catalog')
    expect((await getModelCatalog()).items).toEqual([{ id: 'teste/um', name: 'teste/um', description: '', contextLength: 0, cost: 'unknown', promptPrice: null, completionPrice: null, inputModalities: [], outputModalities: [], hasAdditionalCosts: false, compatible: false }])
  })
  it('compartilha requisições concorrentes e reutiliza cache por 30 minutos', async () => {
    vi.useFakeTimers()
    let complete!: (response: Response) => void
    const fetchMock = vi.fn(() => new Promise<Response>(resolve => { complete = resolve }))
    vi.stubGlobal('fetch', fetchMock)
    const { getModelCatalog } = await import('../../server/utils/model-catalog')
    const first = getModelCatalog()
    const second = getModelCatalog()
    expect(first).toBe(second)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    complete(result([model('teste/um')]))
    await first
    await vi.advanceTimersByTimeAsync(30 * 60_000 - 1)
    expect((await getModelCatalog()).items).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('retorna o último cache como stale quando a atualização falha', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValueOnce(result([model('teste/um')])).mockRejectedValueOnce(new Error('erro privado remoto'))
    vi.stubGlobal('fetch', fetchMock)
    const { getModelCatalog } = await import('../../server/utils/model-catalog')
    const initial = await getModelCatalog()
    await vi.advanceTimersByTimeAsync(30 * 60_000)
    const stale = await getModelCatalog()
    expect(stale).toEqual({ ...initial, stale: true })
    await getModelCatalog()
    await vi.advanceTimersByTimeAsync(29_999)
    await getModelCatalog()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    fetchMock.mockResolvedValueOnce(result([model('teste/atualizado')]))
    await vi.advanceTimersByTimeAsync(1)
    expect((await getModelCatalog()).items[0]?.id).toBe('teste/atualizado')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
  it('interrompe fetch em dez segundos e devolve erro seguro sem cache', async () => {
    vi.useFakeTimers()
    let signal!: AbortSignal
    vi.stubGlobal('fetch', vi.fn((_, options: RequestInit) => new Promise((_, reject) => {
      signal = options.signal!
      signal.addEventListener('abort', () => reject(new Error('detalhe remoto privado')), { once: true })
    })))
    const { getModelCatalog } = await import('../../server/utils/model-catalog')
    const failure = expect(getModelCatalog()).rejects.toMatchObject({ statusCode: 503, statusMessage: 'Catálogo de modelos indisponível. Tente novamente.' })
    await vi.advanceTimersByTimeAsync(10_000)
    await failure
    expect(signal.aborted).toBe(true)
  })
  it('rejeita resposta malformada e permite uma tentativa posterior', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('{"segredo":"não-exibir"}')).mockResolvedValueOnce(result([model('teste/um')]))
    vi.stubGlobal('fetch', fetchMock)
    const { getModelCatalog } = await import('../../server/utils/model-catalog')
    await expect(getModelCatalog()).rejects.toMatchObject({ statusCode: 503 })
    await expect(getModelCatalog()).rejects.toMatchObject({ statusCode: 503 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(30_000)
    expect((await getModelCatalog()).items).toHaveLength(1)
  })
  it('busca sem distinguir acentos/caixa, filtra preços e pagina em grupos de quarenta', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => result([
      ...Array.from({ length: 45 }, (_, i) => model(`teste/modelo${i}`, { name: `Modelo ${i}` })),
      model('teste/acao:free', { name: 'ÁÇÃO' }),
      model('teste/pago', { name: 'Áção paga', pricing: { prompt: '0.001', completion: '0' } }),
      model('teste/incerto', { name: 'Ação incerta', pricing: {} }),
    ])))
    const { getModelCatalog, catalogPage, catalogQuerySchema } = await import('../../server/utils/model-catalog')
    const catalog = await getModelCatalog()
    expect(catalogPage(catalog, catalogQuerySchema.parse({ q: 'acao' })).total).toBe(3)
    expect(catalogPage(catalog, catalogQuerySchema.parse({ q: ':FREE' })).items.map(item => item.id)).toEqual(['teste/acao:free'])
    expect(catalogPage(catalog, catalogQuerySchema.parse({ q: 'ação', pricing: 'paid' })).items.map(item => item.id)).toEqual(['teste/pago'])
    expect(catalogPage(catalog, catalogQuerySchema.parse({ q: 'modelo' })).items).toHaveLength(40)
    expect(catalogPage(catalog, catalogQuerySchema.parse({ q: 'modelo', page: '2' }))).toMatchObject({ total: 45, page: 2, pageSize: 40, items: expect.any(Array) })
    expect(catalogPage(catalog, catalogQuerySchema.parse({ q: 'modelo', page: '2' })).items).toHaveLength(5)
    expect(catalogPage(catalog, catalogQuerySchema.parse({ q: 'modelo', page: '3' })).items).toHaveLength(0)
    for (const query of [{ q: 'a'.repeat(201) }, { pricing: 'unknown' }, { compatibility: 'tools' }, { compatibility: ['compatible'] }, { page: 0 }, { page: '1.5' }, { page: ['1'] }, { url: 'https://externo.example' }]) {
      expect(catalogQuerySchema.safeParse(query).success).toBe(false)
    }
  })
  it('combina compatibilidade, busca e preço antes de calcular total e páginas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => result([
      ...Array.from({ length: 45 }, (_, i) => model(`teste/acao-compativel${i}`, { name: `Ação ${i}` })),
      model('teste/imagem', { name: 'Ação imagem', architecture: { input_modalities: ['text'], output_modalities: ['image'] } }),
      model('teste/sem-tools', { name: 'Ação sem tools', supported_parameters: [] }),
      model('teste/pago', { name: 'Ação paga', pricing: { prompt: '0.001', completion: '0' } }),
      model('teste/outro'),
    ])))
    const { getModelCatalog, catalogPage, catalogQuerySchema } = await import('../../server/utils/model-catalog')
    const catalog = await getModelCatalog()
    expect(catalogQuerySchema.parse({}).compatibility).toBe('all')
    const all = catalogPage(catalog, catalogQuerySchema.parse({ compatibility: 'all' }))
    expect(all).toMatchObject({ total: 49, pageSize: 40 })
    expect(all.items).toHaveLength(40)
    const compatible = catalogPage(catalog, catalogQuerySchema.parse({ q: 'acao', pricing: 'free', compatibility: 'compatible', page: '2' }))
    expect(compatible).toMatchObject({ total: 45, page: 2, pageSize: 40 })
    expect(compatible.items).toHaveLength(5)
    expect(compatible.items.every(item => item.compatible && item.cost === 'free')).toBe(true)
    expect(catalogPage(catalog, catalogQuerySchema.parse({ q: 'AÇÃO', pricing: 'free', compatibility: 'incompatible' })).items.map(item => item.id)).toEqual(['teste/imagem', 'teste/sem-tools'])
    expect(catalogPage(catalog, catalogQuerySchema.parse({ q: 'ação', pricing: 'paid', compatibility: 'incompatible' })).total).toBe(0)
    expect(catalogPage(catalog, catalogQuerySchema.parse({ q: 'ação', pricing: 'paid', compatibility: 'compatible' })).items.map(item => item.id)).toEqual(['teste/pago'])
  })
})

describe('seleção isolada por requisição', () => {
  it('preserva runtimeConfig e não consulta catálogo quando a seleção está ausente', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { resolveProviderConfig } = await import('../../server/utils/model-catalog')
    const provider = await resolveProviderConfig(config, undefined, Date.now() + 60_000)
    expect(provider).toEqual(config)
    expect(provider).not.toBe(config)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('sobrescreve apenas IDs e null desativa fallback do ambiente sem alterar outra requisição', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => result([model('teste/principal'), model('teste/alternativo')])))
    const { resolveProviderConfig } = await import('../../server/utils/model-catalog')
    const first = await resolveProviderConfig(config, { primary: 'teste/principal', fallback: null }, Date.now() + 60_000)
    const second = await resolveProviderConfig(config, { primary: 'teste/alternativo', fallback: 'teste/principal' }, Date.now() + 60_000)
    expect(first).toEqual({ ...config, openrouterModel: 'teste/principal', openrouterFallbackModel: '' })
    expect(second).toEqual({ ...config, openrouterModel: 'teste/alternativo', openrouterFallbackModel: 'teste/principal' })
    expect(config.openrouterFallbackModel).toBe('teste/fallback')
  })
  it.each(['principal', 'fallback'])('recusa %s conhecido sem texto/ferramentas', async target => {
    vi.stubGlobal('fetch', vi.fn(async () => result([model('teste/compativel'), model('teste/imagem', { architecture: { output_modalities: ['image'] } })])))
    const { resolveProviderConfig } = await import('../../server/utils/model-catalog')
    const selection = target === 'principal' ? { primary: 'teste/imagem', fallback: null } : { primary: 'teste/compativel', fallback: 'teste/imagem' }
    await expect(resolveProviderConfig(config, selection, Date.now() + 60_000)).rejects.toMatchObject({ statusCode: 422 })
  })
  it.each(['ausente', 'indisponível'])('permite ID manual quando catálogo está %s', async mode => {
    vi.stubGlobal('fetch', mode === 'ausente' ? vi.fn(async () => result([])) : vi.fn().mockRejectedValue(new Error('falha privada')))
    const { resolveProviderConfig } = await import('../../server/utils/model-catalog')
    await expect(resolveProviderConfig(config, { primary: 'manual/desconhecido:tag', fallback: null }, Date.now() + 60_000)).resolves.toMatchObject({ openrouterModel: 'manual/desconhecido:tag', openrouterFallbackModel: '' })
  })
  it('não espera o catálogo além do tempo restante do turno', async () => {
    vi.useFakeTimers()
    let complete!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { complete = resolve })))
    const { resolveProviderConfig } = await import('../../server/utils/model-catalog')
    const pending = resolveProviderConfig(config, { primary: 'manual/modelo', fallback: null }, Date.now() + 2000)
    await vi.advanceTimersByTimeAsync(2000)
    await expect(pending).resolves.toMatchObject({ openrouterModel: 'manual/modelo' })
    complete(result([]))
  })
})
