import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AssistantEvent, ChatRequest, TechnicalMessage, ToolCall } from '#shared/types'
import { normalizeHistory, toGenkitMessages } from '../../server/ai/history'
import { runAssistantRound } from '../../server/ai/assistant'
import { generateWithGenkit } from '../../server/ai/genkit'

const config = { openrouterApiKey: 'somente-teste-sem-inferencia', openrouterModel: 'deepseek/deepseek-v4.1-flash', openrouterFallbackModel: 'openai/gpt-6-luna' }
const request = (): ChatRequest => ({ kind: 'message', text: 'Abra clientes', turnId: randomUUID(), round: 1, deadlineAt: Date.now() + 60_000, visibleHistory: [], technicalHistory: [], context: { screen: 'assistant', draft: null, clients: [], contracts: [] } })
const call = (): ToolCall => ({ name: 'navigate', input: { screen: 'clients' }, actionId: randomUUID(), ref: 'call-1' })
afterEach(() => { vi.unstubAllGlobals() })
function response(chunks: string[], calls: unknown[] = [], fail = false): ReturnType<typeof generateWithGenkit> {
  return {
    stream: (async function* () { for (const text of chunks) yield { text }; if (fail) throw new Error('erro privado do provedor') })(),
    response: Promise.resolve({ toolRequests: calls }),
  } as ReturnType<typeof generateWithGenkit>
}

describe('provider simulado, sem chamadas OpenRouter', () => {
  it.each([
    { name: 'navigate', args: { screen: 'clients' }, reason: 'awaiting_ack' },
    { name: 'prepare-batch', args: { clients: [{ ref: 'c1', name: 'Ana' }], contracts: [{ ref: 'contrato1', clientRef: 'c1' }] }, reason: 'awaiting_user' },
  ])('integra $name no Genkit e compat-oai reais com SSE fragmentado e fetch simulado', async ({ name, args, reason }) => {
    const frame = (delta: unknown, finish_reason: string | null = null) => `data: ${JSON.stringify({ id: 'teste', object: 'chat.completion.chunk', created: 0, model: config.openrouterModel, choices: [{ index: 0, delta, finish_reason }] })}\n\n`
    const json = JSON.stringify(args)
    const sse = frame({ reasoning_content: 'Raciocínio simulado que não deve aparecer.' })
      + frame({ role: 'assistant', tool_calls: [{ index: 0, id: 'call-genkit', type: 'function', function: { name, arguments: json.slice(0, 10) } }] })
      + frame({ tool_calls: [{ index: 0, function: { arguments: json.slice(10) } }] })
      + frame({}, 'tool_calls') + 'data: [DONE]\n\n'
    const fetchMock = vi.fn(async () => new Response(sse, { headers: { 'Content-Type': 'text/event-stream' } }))
    vi.stubGlobal('fetch', fetchMock)
    const input = request()
    const events: AssistantEvent[] = []
    await runAssistantRound(input, normalizeHistory(input), { ...config, openrouterApiKey: `somente-teste-${name}` }, new AbortController().signal, async event => { events.push(event) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [unknown, RequestInit])[1].body as string)
    expect(body.model).toBe(config.openrouterModel)
    expect(body.max_tokens).toBe(2000)
    expect(body.tools.map((tool: { function: { name: string } }) => tool.function.name)).toEqual(['navigate', 'patch-draft', 'request-review', 'request-delete', 'prepare-batch'])
    expect(body.tools[0].function.parameters.properties.screen.enum).toEqual(expect.arrayContaining(['client-edit', 'contract-edit', 'trash']))
    expect(body.tools[0].function.parameters.properties.recordId.format).toBe('uuid')
    expect(body.tools[3].function.parameters).toMatchObject({
      required: ['entity', 'recordId', 'expectedRevision'],
      additionalProperties: false,
      properties: { recordId: { type: 'string', format: 'uuid' }, expectedRevision: { type: 'integer', minimum: 0 } },
    })
    expect(body.tools[4].function.parameters).toMatchObject({
      required: ['clients', 'contracts'], additionalProperties: false,
      properties: {
        batchId: { type: 'string', format: 'uuid' }, expectedRevision: { type: 'integer', minimum: 0 },
        clients: { type: 'array', maxItems: 10, items: { required: ['ref'], additionalProperties: false } },
        contracts: { type: 'array', maxItems: 10, items: { required: ['ref'], additionalProperties: false } },
      },
    })
    expect(events.filter(event => event.type === 'action_requested')).toHaveLength(1)
    expect(events.find(event => event.type === 'action_requested')).toMatchObject({ call: { name, input: args, ref: 'call-genkit' } })
    expect(events.some(event => event.type === 'text_delta')).toBe(false)
    expect(events.at(-1)).toMatchObject({ type: 'turn_end', reason })
  })
  it.each(['completa', 'parcial'])('preserva campos opcionais na segunda chamada prepare-batch %s pelo Genkit real', async mode => {
    const initial = { clients: [{ ref: 'c1', name: 'Ana', email: 'ana@example.com', phone: '11999990000' }], contracts: [{ ref: 'k1', clientRef: 'c1', title: 'Serviço' }] }
    const batchDraft = { ...initial, batchId: randomUUID(), revision: 1 }
    const update = {
      batchId: batchDraft.batchId, expectedRevision: batchDraft.revision,
      clients: mode === 'completa' ? initial.clients : [],
      contracts: [{ ...(mode === 'completa' ? initial.contracts[0] : { ref: 'k1' }), valueCents: 250000, startDate: '2026-11-15', endDate: '2026-12-15', status: 'active' }],
    }
    const sse = (args: unknown, ref: string) => {
      const frame = (delta: unknown, finish_reason: string | null = null) => `data: ${JSON.stringify({ id: ref, object: 'chat.completion.chunk', created: 0, model: config.openrouterModel, choices: [{ index: 0, delta, finish_reason }] })}\n\n`
      const json = JSON.stringify(args)
      return frame({ role: 'assistant', tool_calls: [{ index: 0, id: ref, type: 'function', function: { name: 'prepare-batch', arguments: json.slice(0, 25) } }] })
        + frame({ tool_calls: [{ index: 0, function: { arguments: json.slice(25) } }] }) + frame({}, 'tool_calls') + 'data: [DONE]\n\n'
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(sse(initial, 'batch-create'), { headers: { 'Content-Type': 'text/event-stream' } }))
      .mockResolvedValueOnce(new Response(sse(update, 'batch-update'), { headers: { 'Content-Type': 'text/event-stream' } }))
    vi.stubGlobal('fetch', fetchMock)
    const settings = { ...config, openrouterApiKey: `somente-teste-update-${mode}` }
    const first = { ...request(), text: 'Cadastre Ana e seu contrato Serviço' }
    const second = { ...request(), text: 'O contrato custa R$ 2.500, começa em 2026-11-15 e termina em 2026-12-15, ativo. Mantenha o cliente.', context: { ...first.context, batchDraft } }
    for (const [input, expected] of [[first, initial], [second, update]] as const) {
      const events: AssistantEvent[] = []
      await runAssistantRound(input, normalizeHistory(input), settings, new AbortController().signal, async event => { events.push(event) })
      const action = events.find(event => event.type === 'action_requested')
      expect(action?.type === 'action_requested' && action.call.input).toEqual(expected)
      expect(events.at(-1)).toMatchObject({ type: 'turn_end', reason: 'awaiting_user' })
    }
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const body = JSON.parse((fetchMock.mock.calls[1] as unknown as [unknown, RequestInit])[1].body as string)
    const contractProperties = body.tools[4].function.parameters.properties.contracts.items.properties
    expect(contractProperties).toMatchObject({
      ref: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,40}$' }, clientRef: { type: 'string' },
      title: { type: 'string' }, valueCents: { type: 'number' }, startDate: { type: 'string' },
      endDate: { type: 'string' }, status: { type: 'string', enum: ['draft', 'active', 'closed'] },
    })
    expect(Object.keys(contractProperties).sort()).toEqual(['clientRef', 'endDate', 'ref', 'startDate', 'status', 'title', 'valueCents'])
    expect(JSON.stringify(body.tools[4].function.parameters)).not.toContain('"$ref"')
    expect(body.tools[4].function.parameters.properties.clients.items.properties).toMatchObject({
      ref: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' },
    })
    expect(body.messages.some((message: { content?: unknown }) => typeof message.content === 'string' && message.content === second.text)).toBe(true)
    expect(body.messages.some((message: { content?: unknown }) => typeof message.content === 'string' && message.content.includes(JSON.stringify(second.context)))).toBe(true)
    expect(body.messages.at(-1)).toMatchObject({ role: 'user', content: second.text })
    const contextIndex = body.messages.findIndex((message: { content?: unknown }) => typeof message.content === 'string' && message.content.includes(JSON.stringify(second.context)))
    const humanIndex = body.messages.findIndex((message: { content?: unknown }) => message.content === second.text)
    expect(contextIndex).toBeLessThan(humanIndex)
    expect(body.messages.filter((message: { content?: unknown }) => message.content === second.text)).toHaveLength(1)
  })
  it('mantém ACK como última mensagem sem inserir contexto depois da resposta de ferramenta', async () => {
    const action = call()
    const input: ChatRequest = {
      ...request(), kind: 'continue', round: 2,
      visibleHistory: [{ role: 'assistant', text: 'Como posso ajudar?' }],
      ack: { actionId: action.actionId, ref: action.ref, status: 'success', screen: 'clients', draft: null },
      technicalHistory: [{ role: 'user', text: 'Abra clientes' }, { role: 'model', call: action }],
    }
    const generate = vi.fn(() => response(['Clientes abertos.']))
    await runAssistantRound(input, normalizeHistory(input), config, new AbortController().signal, async () => {}, generate)
    const args = generate.mock.calls[0] as unknown as Parameters<typeof generateWithGenkit>
    expect(args[3]).toMatchObject([
      { role: 'model', content: [{ text: 'Como posso ajudar?' }] },
      { role: 'user', content: [{ text: expect.stringContaining(JSON.stringify(input.context)) }] },
      { role: 'user', content: [{ text: 'Abra clientes' }] },
      { role: 'model', content: [{ toolRequest: { name: 'navigate', ref: action.ref, input: action.input } }] },
      { role: 'tool', content: [{ toolResponse: { name: 'navigate', ref: action.ref, output: input.ack } }] },
    ])
  })
  it('autoriza fallback só antes de texto ou ação e informa modelo usado', async () => {
    const generate = vi.fn().mockImplementationOnce(() => response([], [], true)).mockImplementationOnce(() => response(['Olá']))
    const events: AssistantEvent[] = []
    const input = request()
    await runAssistantRound(input, normalizeHistory(input), config, new AbortController().signal, async event => { events.push(event) }, generate)
    expect(generate).toHaveBeenCalledTimes(2)
    expect(events[0]).toMatchObject({ type: 'model_selected', model: config.openrouterFallbackModel, fallback: true })
    expect(events.at(-1)).toMatchObject({ type: 'turn_end', reason: 'complete' })
  })
  it('nunca repete geração após emitir texto', async () => {
    const generate = vi.fn(() => response(['Intenção'], [], true))
    const events: AssistantEvent[] = []
    const input = request()
    await expect(runAssistantRound(input, normalizeHistory(input), config, new AbortController().signal, async event => { events.push(event) }, generate)).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
    expect(generate).toHaveBeenCalledTimes(1)
    expect(events.some(event => event.type === 'action_requested')).toBe(false)
  })
  it('propõe ferramenta completa com UUID sem executá-la e normaliza histórico', async () => {
    const action = call()
    const generate = vi.fn(() => response([], [{ toolRequest: { name: action.name, input: action.input, ref: action.ref } }]))
    const events: AssistantEvent[] = []
    const input = request()
    await runAssistantRound(input, normalizeHistory(input), config, new AbortController().signal, async event => { events.push(event) }, generate)
    const event = events.find(event => event.type === 'action_requested')
    expect(event).toMatchObject({ call: { name: 'navigate', input: { screen: 'clients' }, ref: 'call-1' } })
    expect(events.at(-1)).toMatchObject({ type: 'turn_end', reason: 'awaiting_ack' })
  })
  it.each([
    ['navigate', { screen: 'client-edit', recordId: randomUUID() }, 'awaiting_ack'],
    ['navigate', { screen: 'contract-edit', recordId: randomUUID() }, 'awaiting_ack'],
    ['navigate', { screen: 'trash' }, 'awaiting_ack'],
    ['patch-draft', { entity: 'client', draftId: randomUUID(), expectedRevision: 2, fields: { name: 'Ana alterada' } }, 'awaiting_ack'],
    ['request-review', { entity: 'client', draftId: randomUUID(), expectedRevision: 3 }, 'awaiting_user'],
    ['request-delete', { entity: 'client', recordId: randomUUID(), expectedRevision: 4 }, 'awaiting_user'],
    ['request-delete', { entity: 'contract', recordId: randomUUID(), expectedRevision: 1 }, 'awaiting_user'],
    ['prepare-batch', { clients: [{ ref: 'c1', name: 'Ana' }], contracts: [{ ref: 'contrato1', clientRef: 'c1', title: 'Consultoria', valueCents: 50000, startDate: '2026-11-13' }] }, 'awaiting_user'],
    ['prepare-batch', { clients: [{ ref: 'c1', name: 'Ana' }], contracts: [{ ref: 'contrato1' }] }, 'awaiting_user'],
    ['prepare-batch', { clients: [], contracts: [{ ref: 'contrato1', clientRef: randomUUID() }] }, 'awaiting_user'],
    ['prepare-batch', { clients: Array.from({ length: 10 }, (_, i) => ({ ref: `c${i}`, name: `Cliente ${i}` })), contracts: [] }, 'awaiting_user'],
  ] as const)('propõe %s com entrada válida sem executar alterações', async (name, input, reason) => {
    const generate = vi.fn(() => response([], [{ toolRequest: { name, input, ref: 'call-crud' } }]))
    const events: AssistantEvent[] = []
    const message = request()
    await runAssistantRound(message, normalizeHistory(message), config, new AbortController().signal, async event => { events.push(event) }, generate)
    expect(events.find(event => event.type === 'action_requested')).toMatchObject({ call: { name, input, ref: 'call-crud' } })
    expect(events.at(-1)).toMatchObject({ type: 'turn_end', reason })
    expect(generate).toHaveBeenCalledTimes(1)
  })
  it('preserva o contexto do lote e encaminha somente campos alterados com a revisão atual', async () => {
    const batchDraft = { batchId: randomUUID(), revision: 2, clients: [{ ref: 'c1', name: 'Ana' }], contracts: [{ ref: 'contrato1', clientRef: 'c1', title: 'Consultoria' }] }
    const input = { ...request(), text: 'O valor é 500 reais e começa em 13/11/2026', context: { ...request().context, batchDraft } }
    const snapshot = { batchId: batchDraft.batchId, expectedRevision: 2, clients: [], contracts: [{ ref: 'contrato1', valueCents: 50000, startDate: '2026-11-13' }] }
    const generate = vi.fn(() => response([], [{ toolRequest: { name: 'prepare-batch', input: snapshot, ref: 'batch-update' } }]))
    const events: AssistantEvent[] = []
    await runAssistantRound(input, normalizeHistory(input), config, new AbortController().signal, async event => { events.push(event) }, generate)
    const messages = generate.mock.calls[0] as unknown as Parameters<typeof generateWithGenkit>
    expect(messages[3][0]).toMatchObject({ role: 'user', content: [{ text: expect.stringContaining(JSON.stringify(input.context)) }] })
    expect(messages[3].at(-1)).toMatchObject({ role: 'user', content: [{ text: input.text }] })
    expect(events.find(event => event.type === 'action_requested')).toMatchObject({ call: { name: 'prepare-batch', input: snapshot } })
    expect(events.at(-1)).toMatchObject({ type: 'turn_end', reason: 'awaiting_user' })
  })
  it.each([
    [[{ toolRequest: { name: 'save', input: {}, ref: 'x' } }], 'INVALID_MODEL_ACTION'],
    [[{ toolRequest: { name: 'navigate', input: { screen: 'https://externo.example' }, ref: 'x' } }], 'INVALID_MODEL_ACTION'],
    [[{ toolRequest: { name: 'navigate', input: { screen: 'client-edit' }, ref: 'x' } }], 'INVALID_MODEL_ACTION'],
    [[{ toolRequest: { name: 'navigate', input: { screen: 'contract-edit', recordId: 'inventado' }, ref: 'x' } }], 'INVALID_MODEL_ACTION'],
    [[{ toolRequest: { name: 'request-delete', input: { entity: 'client', recordId: randomUUID() }, ref: 'x' } }], 'INVALID_MODEL_ACTION'],
    [[{ toolRequest: { name: 'request-delete', input: { entity: 'contract', recordId: 'inventado', expectedRevision: 0 }, ref: 'x' } }], 'INVALID_MODEL_ACTION'],
    [[{ toolRequest: { name: 'request-delete', input: { entity: 'client', recordId: randomUUID(), expectedRevision: -1 }, ref: 'x' } }], 'INVALID_MODEL_ACTION'],
    [[{ toolRequest: { name: 'request-delete', input: { entity: 'client', recordId: randomUUID(), expectedRevision: 0, confirmed: true }, ref: 'x' } }], 'INVALID_MODEL_ACTION'],
    [[{ toolRequest: { name: 'restore', input: { entity: 'client', recordId: randomUUID() }, ref: 'x' } }], 'INVALID_MODEL_ACTION'],
    [[{ toolRequest: { name: 'prepare-batch', input: { clients: [], contracts: [] }, ref: 'x' } }], 'INVALID_MODEL_ACTION'],
    [[{ toolRequest: { name: 'prepare-batch', input: { clients: Array.from({ length: 6 }, (_, i) => ({ ref: `c${i}` })), contracts: Array.from({ length: 5 }, (_, i) => ({ ref: `contrato${i}` })) }, ref: 'x' } }], 'INVALID_MODEL_ACTION'],
    [[{ toolRequest: { name: 'prepare-batch', input: { clients: [{ ref: 'c1' }], contracts: [{ ref: 'c1' }] }, ref: 'x' } }], 'INVALID_MODEL_ACTION'],
    [[{ toolRequest: { name: 'prepare-batch', input: { clients: [{ ref: 'ref inválida' }], contracts: [] }, ref: 'x' } }], 'INVALID_MODEL_ACTION'],
    [[{ toolRequest: { name: 'prepare-batch', input: { clients: [{ ref: 'c1', fields: { name: 'Ana' } }], contracts: [] }, ref: 'x' } }], 'INVALID_MODEL_ACTION'],
    [[{ toolRequest: { name: 'prepare-batch', input: { batchId: randomUUID(), clients: [{ ref: 'c1' }], contracts: [] }, ref: 'x' } }], 'INVALID_MODEL_ACTION'],
    [[{ toolRequest: { name: 'prepare-batch', input: { expectedRevision: 0, clients: [{ ref: 'c1' }], contracts: [] }, ref: 'x' } }], 'INVALID_MODEL_ACTION'],
    [[{ toolRequest: { name: 'prepare-batch', input: { clients: [{ ref: 'c1' }], contracts: [], confirmed: true }, ref: 'x' } }], 'INVALID_MODEL_ACTION'],
    [[{ toolRequest: { name: 'navigate', input: { screen: 'clients' }, ref: 'x' } }, { toolRequest: { name: 'navigate', input: { screen: 'clients' }, ref: 'y' } }], 'MULTIPLE_ACTIONS'],
  ] as const)('recusa ferramentas inválidas após fallback e recusa propostas múltiplas', async (calls, code) => {
    const generate = vi.fn(() => response([], [...calls]))
    const events: AssistantEvent[] = []
    const input = request()
    await expect(runAssistantRound(input, normalizeHistory(input), config, new AbortController().signal, async event => { events.push(event) }, generate)).rejects.toMatchObject({ code })
    expect(generate).toHaveBeenCalledTimes(code === 'MULTIPLE_ACTIONS' ? 1 : 2)
    expect(events).toEqual([])
  })
  it('aborto não inicia fallback', async () => {
    const controller = new AbortController(); controller.abort()
    const input = request()
    const generate = vi.fn()
    await expect(runAssistantRound(input, normalizeHistory(input), config, controller.signal, async () => {}, generate)).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(generate).not.toHaveBeenCalled()
  })
})

describe('fallback para lote incompleto sem progresso', () => {
  function fixture() {
    const batchDraft = { batchId: randomUUID(), revision: 0, clients: [{ ref: 'c1', name: 'Ana' }], contracts: [{ ref: 'k1', clientRef: 'c1', title: 'Serviço' }] }
    const input: ChatRequest = { ...request(), text: 'O contrato custa R$ 2500 e começa em 2026-11-15. Mantenha o cliente.', context: { ...request().context, batchDraft } }
    const unchanged = { batchId: batchDraft.batchId, expectedRevision: 0, clients: [], contracts: [{ ref: 'k1', clientRef: 'c1' }] }
    const updated = { ...unchanged, contracts: [{ ref: 'k1', valueCents: 250000, startDate: '2026-11-15' }] }
    const tool = (payload: unknown) => response([], [{ toolRequest: { name: 'prepare-batch', input: payload, ref: 'batch-1' } }])
    return { input, unchanged, updated, tool }
  }
  it('tenta Luna uma vez antes de emitir proposta sem progresso e informa fallback', async () => {
    const { input, unchanged, updated, tool } = fixture()
    const generate = vi.fn().mockImplementationOnce(() => tool(unchanged)).mockImplementationOnce(() => tool(updated))
    const events: AssistantEvent[] = []
    await runAssistantRound(input, normalizeHistory(input), config, new AbortController().signal, async event => { events.push(event) }, generate)
    expect(generate).toHaveBeenCalledTimes(2)
    expect(generate.mock.calls.map(args => args[1])).toEqual([config.openrouterModel, config.openrouterFallbackModel])
    expect(events[0]).toMatchObject({ type: 'model_selected', model: config.openrouterFallbackModel, fallback: true })
    expect(events.filter(event => event.type === 'action_requested')).toHaveLength(1)
    expect(events.find(event => event.type === 'action_requested')).toMatchObject({ call: { input: updated } })
    expect(events.at(-1)).toMatchObject({ type: 'turn_end', reason: 'awaiting_user' })
  })
  it.each(['vínculo-inválido-e-telefone-vazio', 'telefone-vazio', 'valor-data-inválidos', 'vínculo-inválido-com-valor-válido'])('usa fallback para %s sem aplicar a proposta ruim', async variant => {
    const { input, unchanged, updated, tool } = fixture()
    const bad = {
      ...unchanged, clients: [{ ref: 'c1', phone: '' }],
      contracts: [{
        ref: 'k1', clientRef: variant.startsWith('vínculo-inválido') ? 'alias-inexistente' : 'c1',
        ...(variant === 'valor-data-inválidos' ? { valueCents: 0, startDate: '2026' } : {}),
        ...(variant === 'vínculo-inválido-com-valor-válido' ? { valueCents: 250000 } : {}),
      }],
    }
    const generate = vi.fn().mockImplementationOnce(() => tool(bad)).mockImplementationOnce(() => tool(updated))
    const events: AssistantEvent[] = []
    await runAssistantRound(input, normalizeHistory(input), config, new AbortController().signal, async event => { events.push(event) }, generate)
    expect(generate).toHaveBeenCalledTimes(2)
    expect(events[0]).toMatchObject({ type: 'model_selected', fallback: true })
    expect(events.filter(event => event.type === 'action_requested')).toHaveLength(1)
    expect(events.find(event => event.type === 'action_requested')).toMatchObject({ call: { input: updated } })
  })
  it.each(['preencher', 'limpar'])('permite %s um telefone enquanto o lote ainda está incompleto', async variant => {
    const { input, unchanged, tool } = fixture()
    if (variant === 'limpar') input.context.batchDraft!.clients[0]!.phone = '11999990000'
    const update = { ...unchanged, clients: [{ ref: 'c1', phone: variant === 'limpar' ? '' : '11999990000' }], contracts: [] }
    const generate = vi.fn(() => tool(update))
    const events: AssistantEvent[] = []
    await runAssistantRound(input, normalizeHistory(input), config, new AbortController().signal, async event => { events.push(event) }, generate)
    expect(generate).toHaveBeenCalledTimes(1)
    expect(events[0]).toMatchObject({ type: 'model_selected', fallback: false })
    expect(events.find(event => event.type === 'action_requested')).toMatchObject({ call: { input: update } })
  })
  it.each(['alias', 'cliente-ativo'])('permite reabrir a revisão de lote completo com %s sem fallback', async link => {
    const { input, unchanged, tool } = fixture()
    const draft = input.context.batchDraft!
    const activeId = randomUUID()
    input.context.batchDraft = { ...draft, contracts: [{ ...draft.contracts[0]!, clientRef: link === 'alias' ? 'c1' : activeId, valueCents: 250000, startDate: '2026-11-15' }] }
    input.context.clients = [{ id: activeId, name: 'Cliente ativo', revision: 0 }]
    const noChange = { ...unchanged, contracts: [{ ref: 'k1' }] }
    const generate = vi.fn(() => tool(noChange))
    const events: AssistantEvent[] = []
    await runAssistantRound(input, normalizeHistory(input), config, new AbortController().signal, async event => { events.push(event) }, generate)
    expect(generate).toHaveBeenCalledTimes(1)
    expect(events[0]).toMatchObject({ type: 'model_selected', model: config.openrouterModel, fallback: false })
    expect(events.find(event => event.type === 'action_requested')).toMatchObject({ call: { input: noChange } })
  })
  it('não usa fallback após emitir texto e não aplica a ação sem progresso', async () => {
    const { input, unchanged } = fixture()
    const generate = vi.fn(() => response(['Vou completar.'], [{ toolRequest: { name: 'prepare-batch', input: unchanged, ref: 'batch-1' } }]))
    const events: AssistantEvent[] = []
    await expect(runAssistantRound(input, normalizeHistory(input), config, new AbortController().signal, async event => { events.push(event) }, generate)).rejects.toMatchObject({ code: 'NO_PROGRESS' })
    expect(generate).toHaveBeenCalledTimes(1)
    expect(events.some(event => event.type === 'text_delta')).toBe(true)
    expect(events.some(event => event.type === 'action_requested')).toBe(false)
  })
  it.each(['sem-fallback', 'fallback-sem-progresso'])('encerra %s com NO_PROGRESS sem efeitos ou repetição extra', async mode => {
    const { input, unchanged, tool } = fixture()
    const generate = vi.fn(() => tool(unchanged))
    const events: AssistantEvent[] = []
    const settings = mode === 'sem-fallback' ? { ...config, openrouterFallbackModel: '' } : config
    await expect(runAssistantRound(input, normalizeHistory(input), settings, new AbortController().signal, async event => { events.push(event) }, generate)).rejects.toMatchObject({ code: 'NO_PROGRESS' })
    expect(generate).toHaveBeenCalledTimes(mode === 'sem-fallback' ? 1 : 2)
    expect(events).toEqual([])
  })
  it.each(['nome-ausente', 'cliente-inexistente', 'datas-inválidas'])('detecta %s no lote e permite que o fallback faça uma pergunta', async missing => {
    const { input, unchanged, tool } = fixture()
    input.context.batchDraft!.contracts = [{ ref: 'k1', title: 'Serviço', clientRef: 'c1', valueCents: 250000, startDate: '2026-11-15' }]
    if (missing === 'nome-ausente') input.context.batchDraft!.clients = [{ ref: 'c1' }]
    if (missing === 'cliente-inexistente') input.context.batchDraft!.contracts[0]!.clientRef = randomUUID()
    if (missing === 'datas-inválidas') input.context.batchDraft!.contracts[0]!.endDate = '2026-11-14'
    const generate = vi.fn().mockImplementationOnce(() => tool({ ...unchanged, contracts: [{ ref: 'k1' }] })).mockImplementationOnce(() => response(['Pode esclarecer os dados do cadastro?']))
    const events: AssistantEvent[] = []
    await runAssistantRound(input, normalizeHistory(input), config, new AbortController().signal, async event => { events.push(event) }, generate)
    expect(generate).toHaveBeenCalledTimes(2)
    expect(events[0]).toMatchObject({ type: 'model_selected', fallback: true })
    expect(events.some(event => event.type === 'action_requested')).toBe(false)
    expect(events.at(-1)).toMatchObject({ type: 'turn_end', reason: 'complete' })
  })
  it('mantém a proposta principal quando ela altera um campo', async () => {
    const { input, updated, tool } = fixture()
    const generate = vi.fn(() => tool(updated))
    const events: AssistantEvent[] = []
    await runAssistantRound(input, normalizeHistory(input), config, new AbortController().signal, async event => { events.push(event) }, generate)
    expect(generate).toHaveBeenCalledTimes(1)
    expect(events[0]).toMatchObject({ type: 'model_selected', fallback: false })
  })
  it('mantém a proposta principal quando ela adiciona um item ao lote incompleto', async () => {
    const { input, unchanged, tool } = fixture()
    const generate = vi.fn(() => tool({ ...unchanged, clients: [{ ref: 'c2', name: 'Bia' }], contracts: [] }))
    const events: AssistantEvent[] = []
    await runAssistantRound(input, normalizeHistory(input), config, new AbortController().signal, async event => { events.push(event) }, generate)
    expect(generate).toHaveBeenCalledTimes(1)
    expect(events[0]).toMatchObject({ type: 'model_selected', fallback: false })
    expect(events.some(event => event.type === 'action_requested')).toBe(true)
  })
  it('tenta fallback para schema inválido antes de emitir qualquer efeito', async () => {
    const { input, unchanged, updated, tool } = fixture()
    const generate = vi.fn().mockImplementationOnce(() => tool({ ...unchanged, confirmed: true })).mockImplementationOnce(() => tool(updated))
    const events: AssistantEvent[] = []
    await runAssistantRound(input, normalizeHistory(input), config, new AbortController().signal, async event => { events.push(event) }, generate)
    expect(generate).toHaveBeenCalledTimes(2)
    expect(events[0]).toMatchObject({ type: 'model_selected', fallback: true })
    expect(events.find(event => event.type === 'action_requested')).toMatchObject({ call: { input: updated } })
  })
  it('tenta fallback para lote novo que contém somente referências e vínculos', async () => {
    const input = { ...request(), text: 'Cadastre Ana e seu contrato Consultoria' }
    const generate = vi.fn()
      .mockImplementationOnce(() => response([], [{ toolRequest: { name: 'prepare-batch', ref: 'empty-batch', input: { clients: [{ ref: 'c1', phone: '' }], contracts: [{ ref: 'k1', clientRef: 'c1', status: 'draft' }] } } }]))
      .mockImplementationOnce(() => response([], [{ toolRequest: { name: 'prepare-batch', ref: 'useful-batch', input: { clients: [{ ref: 'c1', name: 'Ana' }], contracts: [{ ref: 'k1', clientRef: 'c1', title: 'Consultoria' }] } } }]))
    const events: AssistantEvent[] = []
    await runAssistantRound(input, normalizeHistory(input), config, new AbortController().signal, async event => { events.push(event) }, generate)
    expect(generate).toHaveBeenCalledTimes(2)
    expect(events[0]).toMatchObject({ type: 'model_selected', fallback: true })
    expect(events.filter(event => event.type === 'action_requested')).toHaveLength(1)
    expect(events.find(event => event.type === 'action_requested')).toMatchObject({ call: { input: { clients: [{ ref: 'c1', name: 'Ana' }] } } })
  })
  it('não tenta fallback de schema inválido depois de texto ou cancelamento', async () => {
    const { input, unchanged, tool } = fixture()
    const generate = vi.fn(() => response(['Vou completar.'], [{ toolRequest: { name: 'prepare-batch', ref: 'invalid', input: { ...unchanged, confirmed: true } } }]))
    await expect(runAssistantRound(input, normalizeHistory(input), config, new AbortController().signal, async () => {}, generate)).rejects.toMatchObject({ code: 'INVALID_MODEL_ACTION' })
    expect(generate).toHaveBeenCalledTimes(1)
    const controller = new AbortController(); controller.abort()
    generate.mockClear()
    await expect(runAssistantRound(input, normalizeHistory(input), config, controller.signal, async () => {}, generate)).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(generate).not.toHaveBeenCalled()
  })
})

describe('validação de histórico técnico', () => {
  it('adapta ACK negativo preservando nome e referência', () => {
    const action = call()
    const input: ChatRequest = { ...request(), kind: 'continue', round: 2, ack: { actionId: action.actionId, ref: action.ref, status: 'rejected', code: 'USER_REJECTED', screen: 'assistant', draft: null }, technicalHistory: [{ role: 'user', text: 'Abra clientes' }, { role: 'model', text: 'Vou abrir.' }, { role: 'model', call: action }] }
    const history = normalizeHistory(input)
    const messages = toGenkitMessages([], history)
    expect(messages.at(-1)).toMatchObject({ role: 'tool', content: [{ toolResponse: { name: 'navigate', ref: action.ref, output: { status: 'rejected' } } }] })
    expect(messages[1]?.content).toHaveLength(2)
    expect(() => normalizeHistory({ ...input, ack: { ...input.ack, ref: 'órfão' } })).toThrow(/INVALID_HISTORY/)
    expect(() => normalizeHistory({ ...input, round: 3 })).toThrow(/INVALID_HISTORY/)
    const duplicate: TechnicalMessage[] = [...history, { role: 'model', call: action }]
    expect(() => normalizeHistory({ ...input, round: 3, technicalHistory: duplicate })).toThrow(/INVALID_HISTORY/)
  })
  it('recusa mensagens e resultados órfãos', () => {
    const input = request()
    expect(() => normalizeHistory({ ...input, round: 2 })).toThrow(/INVALID_HISTORY/)
    expect(() => normalizeHistory({ ...input, technicalHistory: [{ role: 'user', text: 'injetado' }] })).toThrow(/INVALID_HISTORY/)
    const action = call()
    const continued: ChatRequest = { ...input, kind: 'continue', round: 2, ack: { actionId: action.actionId, ref: action.ref, status: 'success', screen: 'assistant', draft: null }, technicalHistory: [{ role: 'user', text: 'Revisar' }, { role: 'model', call: { ...action, name: 'request-review', input: { entity: 'client', draftId: randomUUID(), expectedRevision: 0 } } }] }
    expect(() => normalizeHistory(continued)).toThrow(/INVALID_HISTORY/)
    expect(() => normalizeHistory({ ...continued, technicalHistory: [{ role: 'user', text: 'Revisar' }, { role: 'tool', result: continued.ack }] })).toThrow(/INVALID_HISTORY/)
  })
  it.each(['request-review', 'request-delete', 'prepare-batch'] as const)('recusa continuação de %s mesmo com ACK de sucesso', name => {
    const action: ToolCall = name === 'request-review'
      ? { name, actionId: randomUUID(), ref: 'review', input: { entity: 'client', draftId: randomUUID(), expectedRevision: 0 } }
      : name === 'request-delete'
        ? { name, actionId: randomUUID(), ref: 'delete', input: { entity: 'contract', recordId: randomUUID(), expectedRevision: 2 } }
        : { name, actionId: randomUUID(), ref: 'batch', input: { clients: [{ ref: 'c1' }], contracts: [] } }
    const continued: ChatRequest = {
      ...request(), kind: 'continue', round: 2,
      ack: { actionId: action.actionId, ref: action.ref, status: 'success', screen: 'assistant', draft: null },
      technicalHistory: [{ role: 'user', text: 'Confirme' }, { role: 'model', call: action }],
    }
    expect(() => normalizeHistory(continued)).toThrow(/INVALID_HISTORY/)
  })
})
