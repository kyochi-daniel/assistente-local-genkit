import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatRequest, Draft, ToolCall } from '../../shared/types'
import { useAssistant } from '../../app/composables/useAssistant'

const mocks = vi.hoisted(() => {
  const route = { path: '/assistente' }
  const app = { $router: { currentRoute: { value: { path: '/assistente' } } } }
  return { route, app, states: new Map(), navigateTo: vi.fn(), workspace: vi.fn() }
})

vi.mock('#imports', () => ({
  useNuxtApp: () => mocks.app,
  useRoute: () => mocks.route,
  useState: (key: string, init: () => unknown) => {
    if (!mocks.states.has(key)) mocks.states.set(key, { value: init() })
    return mocks.states.get(key)
  },
  navigateTo: mocks.navigateTo,
}))
vi.mock('../../app/composables/useWorkspace', () => ({ useWorkspace: mocks.workspace }))

const draft: Draft = {
  entity: 'client', draftId: '00000000-0000-4000-8000-000000000001', revision: 0, fields: {},
}
const navigate: ToolCall = {
  actionId: '00000000-0000-4000-8000-000000000002', ref: 'navigate-client',
  name: 'navigate', input: { screen: 'client-new' },
}
const patch: ToolCall = {
  actionId: '00000000-0000-4000-8000-000000000003', ref: 'patch-client', name: 'patch-draft',
  input: { entity: 'client', draftId: draft.draftId, expectedRevision: 0, fields: { name: 'Ana' } },
}

function mockResponses(calls: ToolCall[]) {
  const requests: ChatRequest[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, { body }: RequestInit) => {
    const request = JSON.parse(String(body)) as ChatRequest
    requests.push(request)
    const call = calls[requests.length - 1]
    const events = [
      ...(call ? [{ type: 'action_requested', call }] : []),
      { type: 'turn_end', reason: call ? 'awaiting_ack' : 'complete', technicalHistory: [] },
    ].map(event => ({ ...event, turnId: request.turnId }))
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''))
  }))
  return requests
}

describe('navegação do assistente', () => {
  afterEach(() => vi.unstubAllGlobals())

  beforeEach(() => {
    vi.resetAllMocks()
    mocks.states.clear()
    mocks.app.$router.currentRoute.value = { path: '/assistente' }
    const state = { value: { draft: null as Draft | null, clients: [], contracts: [], messages: [] } }
    mocks.workspace.mockReturnValue({
      state, batchDraft: { value: null }, batchReview: { value: null }, batchIssues: { value: [] }, prepareBatch: vi.fn(() => true), activeClients: { value: [] }, activeContracts: { value: [] }, saving: { value: false }, init: vi.fn(), addMessage: vi.fn(),
      openDraft: vi.fn(async () => { state.value = { ...state.value, draft }; return true }),
      updateDraft: vi.fn(() => true), requestReview: vi.fn(() => true), requestDelete: vi.fn(() => true),
      openEdit: vi.fn(async () => { state.value = { ...state.value, draft: { ...draft, recordId: draft.draftId, recordRevision: 0 } }; return true }),
    })
  })

  it('usa a rota confirmada no ACK, contexto e patch enquanto useRoute continua atrasado', async () => {
    mocks.navigateTo.mockImplementation(async (path: string) => {
      mocks.app.$router.currentRoute.value = { path }
    })
    const requests = mockResponses([navigate, patch])
    const assistant = useAssistant()

    await assistant.send('Cadastre Ana')

    expect(mocks.route.path).toBe('/assistente')
    expect(mocks.navigateTo).toHaveBeenCalledWith('/clientes/novo')
    expect(requests[1]).toMatchObject({
      kind: 'continue', context: { screen: 'client-new' },
      ack: { status: 'success', screen: 'client-new', draft },
    })
    expect(requests[2]).toMatchObject({ ack: { status: 'success', screen: 'client-new' } })
    expect(mocks.workspace().updateDraft).toHaveBeenCalledWith({ name: 'Ana' })
    expect(assistant.status.value).toBe('completed')
  })

  it('mantém NAVIGATION_FAILED se o roteador não chegar ao destino', async () => {
    mocks.navigateTo.mockResolvedValue(false)
    const requests = mockResponses([navigate])

    await useAssistant().send('Cadastre Ana')

    expect(requests[1]).toMatchObject({
      context: { screen: 'assistant' },
      ack: { status: 'error', code: 'NAVIGATION_FAILED', screen: 'assistant' },
    })
  })

it('abre edição pelo ID e aceita patch na rota confirmada', async () => {
  mocks.navigateTo.mockImplementation(async (path: string) => { mocks.app.$router.currentRoute.value = { path } })
  const requests = mockResponses([{ ...navigate, input: { screen: 'client-edit', recordId: draft.draftId } }, patch])
  await useAssistant().send('Edite Ana')
  expect(mocks.workspace().openEdit).toHaveBeenCalledWith('client', draft.draftId)
  expect(mocks.navigateTo).toHaveBeenCalledWith(`/clientes/${draft.draftId}/editar`)
  expect(requests[2]).toMatchObject({ ack: { status: 'success', screen: 'client-edit' } })
})

it('pedido de exclusão só apresenta cartão e encerra o turno sem continuação', async () => {
  const workspace = mocks.workspace()
  workspace.state.value.clients = [{ id: draft.draftId, name: 'Ana', revision: 2 }]
  const requests = mockResponses([{ actionId: navigate.actionId, ref: 'delete-client', name: 'request-delete', input: { entity: 'client', recordId: draft.draftId, expectedRevision: 2 } }])
  const assistant = useAssistant()
  await assistant.send('Exclua Ana')
  expect(workspace.requestDelete).toHaveBeenCalledWith('client', draft.draftId)
  expect(requests).toHaveLength(1)
  expect(assistant.status.value).toBe('awaiting_confirmation')
})

it('rejeita exclusão com revisão obsoleta sem apresentar cartão', async () => {
  const workspace = mocks.workspace()
  workspace.state.value.clients = [{ id: draft.draftId, name: 'Ana', revision: 2 }]
  mockResponses([{ actionId: navigate.actionId, ref: 'delete-client', name: 'request-delete', input: { entity: 'client', recordId: draft.draftId, expectedRevision: 1 } }])
  await useAssistant().send('Exclua Ana')
  expect(workspace.requestDelete).not.toHaveBeenCalled()
})

  it('pinta progresso antes da navegação e não grava avisos repetitivos no histórico', async () => {
    const frames: FrameRequestCallback[] = []
    const cancelAnimationFrame = vi.fn()
    vi.stubGlobal('window', { requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length }), cancelAnimationFrame })
    const assistant = useAssistant()
    mocks.navigateTo.mockImplementation(async (path: string) => {
      expect(assistant.navigation.value).toEqual({ screen: 'client-new', label: 'Abrindo clientes…' })
      mocks.app.$router.currentRoute.value = { path }
    })
    mockResponses([navigate, patch])
    const sending = assistant.send('Cadastre Ana')
    await vi.waitFor(() => expect(frames).toHaveLength(1))
    expect(mocks.navigateTo).not.toHaveBeenCalled()
    frames[0]!(0)
    expect(frames).toHaveLength(2)
    expect(mocks.navigateTo).not.toHaveBeenCalled()
    frames[1]!(16)
    await sending
    expect(assistant.navigation.value).toBeNull()
    expect(mocks.workspace().addMessage.mock.calls).toEqual([['user', 'Cadastre Ana']])
  })

  it('parar durante o paint limpa progresso e impede navegação tardia', async () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('window', { requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length }), cancelAnimationFrame: vi.fn() })
    mockResponses([navigate])
    const assistant = useAssistant()
    const sending = assistant.send('Abra clientes')
    await vi.waitFor(() => expect(frames).toHaveLength(1))
    assistant.stop()
    expect(assistant.navigation.value).toBeNull()
    await sending
    expect(mocks.navigateTo).not.toHaveBeenCalled()
    expect(assistant.status.value).toBe('cancelled')
  })

  it('mantém falha factual curta e limpa progresso quando a navegação lança erro', async () => {
    mocks.navigateTo.mockRejectedValue(new Error('router'))
    mockResponses([navigate])
    const assistant = useAssistant()
    await assistant.send('Abra clientes')
    expect(assistant.navigation.value).toBeNull()
    expect(mocks.workspace().addMessage).toHaveBeenCalledWith('assistant', 'Ação não concluída. Tente novamente.')
  })

  it('prepara lote, pergunta pendências por item e encerra sem continuação nem gravação', async () => {
    const workspace = mocks.workspace()
    workspace.batchIssues.value = ['Contrato Projeto: informe o cliente deste contrato.']
    const requests = mockResponses([{ actionId: navigate.actionId, ref: 'prepare', name: 'prepare-batch', input: { clients: [{ ref: 'ana', name: 'Ana' }], contracts: [{ ref: 'projeto', title: 'Projeto' }] } }])
    const assistant = useAssistant()
    await assistant.send('Crie Ana e um contrato')
    expect(workspace.prepareBatch).toHaveBeenCalled()
    expect(requests).toHaveLength(1)
    expect(assistant.status.value).toBe('awaiting_input')
    expect(workspace.addMessage).toHaveBeenCalledWith('assistant', expect.stringContaining('Contrato Projeto'))
    expect(workspace.addMessage).toHaveBeenCalledWith('assistant', expect.stringContaining('Qual é esse dado?'))
  })

  it('envia lote atual no próximo turno e pede uma confirmação quando estiver completo', async () => {
    const workspace = mocks.workspace()
    const batchId = draft.draftId
    workspace.batchDraft.value = { batchId, revision: 1, clients: [{ ref: 'ana' }], contracts: [] }
    workspace.batchReview.value = { batchId }
    const requests = mockResponses([{ actionId: navigate.actionId, ref: 'prepare', name: 'prepare-batch', input: { batchId, expectedRevision: 1, clients: [{ ref: 'ana', name: 'Ana' }], contracts: [] } }])
    const assistant = useAssistant()
    await assistant.send('O nome é Ana')
    expect(requests[0]?.context.batchDraft).toEqual(workspace.batchDraft.value)
    expect(requests).toHaveLength(1)
    expect(assistant.status.value).toBe('awaiting_confirmation')
    expect(workspace.addMessage).toHaveBeenCalledWith('assistant', 'Confira o lote para confirmar.')
  })

  it('apresenta mensagem segura de erro do stream e preserva rascunho', async () => {
    const workspace = mocks.workspace()
    workspace.state.value.draft = draft
    vi.stubGlobal('fetch', vi.fn(async (_url: string, { body }: RequestInit) => {
      const { turnId } = JSON.parse(String(body))
      return new Response(`data: ${JSON.stringify({ turnId, type: 'error', code: 'NO_PROGRESS', message: 'Informe o valor do contrato.' })}\n\n`)
    }))
    const assistant = useAssistant()
    await assistant.send('Complete o contrato')
    expect(assistant.error.value).toBe('Informe o valor do contrato.')
    expect(assistant.status.value).toBe('error')
    expect(workspace.state.value.draft).toBe(draft)
    expect(workspace.updateDraft).not.toHaveBeenCalled()
  })

})
