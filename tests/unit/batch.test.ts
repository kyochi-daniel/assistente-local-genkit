import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { batchIssuesFor, createBatchReview, confirmBatchSnapshot } from '../../app/utils/batch'
import { emptyWorkspace, STORAGE_KEY } from '../../app/utils/storage'
import { useWorkspace } from '../../app/composables/useWorkspace'
import type { BatchDraft } from '../../shared/types'

const mocks = vi.hoisted(() => ({ states: new Map(), setItem: vi.fn(), confirm: vi.fn() }))
vi.mock('#imports', async () => {
  const { ref } = await import('vue')
  return { useState: (key: string, init: () => unknown) => {
    if (!mocks.states.has(key)) mocks.states.set(key, ref(init()))
    return mocks.states.get(key)
  } }
})
const now = '2026-11-13T12:00:00.000Z'
const draft: BatchDraft = {
  batchId: '00000000-0000-4000-8000-000000000001', revision: 0,
  clients: [{ ref: 'ana', name: 'Ana' }, { ref: 'bia', name: 'Bia' }],
  contracts: [{ ref: 'servico', clientRef: 'ana', title: 'Serviço', valueCents: 100, startDate: '2026-11-13' }],
}

beforeEach(() => {
  mocks.states.clear()
  mocks.setItem.mockReset()
  mocks.confirm.mockReset().mockReturnValue(true)
  vi.stubGlobal('process', { ...process, client: true })
  vi.stubGlobal('window', { confirm: mocks.confirm })
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: mocks.setItem })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ authenticated: true }))))
})
afterEach(() => vi.unstubAllGlobals())

describe('lote com dependências e confirmação única', () => {
  it('resolve aliases para IDs novos e mantém todos os registros fora do estado antes do commit', () => {
    const workspace = { ...emptyWorkspace(), batchDraft: draft }
    const review = createBatchReview(draft, workspace)
    expect(Object.isFrozen(review.snapshot.clients[0])).toBe(true)
    const result = confirmBatchSnapshot(workspace, review, now)
    expect(result.clients).toHaveLength(2)
    expect(result.contracts[0]?.clientId).toBe(result.clients[0]?.id)
    expect(result.contracts[0]?.revision).toBe(0)
    expect(result.workspace.batchDraft).toBeNull()
    expect(workspace.clients).toEqual([])
    expect(workspace.contracts).toEqual([])
    expect(() => confirmBatchSnapshot(result.workspace, review, now)).toThrow()
  })

  it('expõe faltantes por item e bloqueia lote incompleto sem criar clientes pela metade', () => {
    const incomplete = { ...draft, contracts: [{ ref: 'faltante', title: 'Projeto' }] }
    expect(batchIssuesFor(incomplete, emptyWorkspace()).join(' ')).toContain('Projeto: informe o cliente')
    expect(() => createBatchReview(incomplete, emptyWorkspace())).toThrow('Complete')
    const workspace = useWorkspace()
    expect(workspace.prepareBatch({ clients: incomplete.clients, contracts: incomplete.contracts })).toBe(true)
    expect(workspace.batchReview.value).toBeNull()
    expect(workspace.state.value.clients).toHaveLength(0)
    expect(workspace.batchIssues.value.length).toBeGreaterThan(0)
  })

  it('valida snapshot, aliases duplicados, IDs conflitantes e limites incluindo lixeira', () => {
    const workspace = { ...emptyWorkspace(), batchDraft: draft }
    const review = createBatchReview(draft, workspace)
    expect(() => confirmBatchSnapshot({ ...workspace, batchDraft: { ...draft, revision: 1 } }, review, now)).toThrow()
    expect(() => createBatchReview({ ...draft, clients: [{ ref: 'ana', name: 'Ana' }, { ref: 'ana', name: 'Outra' }] }, workspace)).toThrow()
    expect(() => confirmBatchSnapshot(workspace, { ...review, ids: Object.fromEntries(Object.keys(review.ids).map(ref => [ref, draft.batchId])) }, now)).toThrow()
    const clients = Array.from({ length: 199 }, (_, n) => ({ id: `00000000-0000-4000-8000-${String(n + 10).padStart(12, '0')}`, name: 'Arquivado', email: '', phone: '', createdAt: now, deletedAt: now, deletionBatchId: draft.batchId }))
    expect(() => confirmBatchSnapshot({ ...workspace, clients }, review, now)).toThrow('200')
    expect(workspace.clients).toHaveLength(0)
  })

  it('liga cliente existente ativo e rejeita referência arquivada antes de confirmar', () => {
    const client = { id: draft.batchId, name: 'Existente', email: '', phone: '', createdAt: now }
    const existing = { ...draft, clients: [], contracts: draft.contracts.map(item => ({ ...item, clientRef: client.id })) }
    const workspace = { ...emptyWorkspace(), clients: [client], batchDraft: existing }
    const review = createBatchReview(existing, workspace)
    expect(confirmBatchSnapshot(workspace, review, now).contracts[0]?.clientId).toBe(client.id)
    expect(() => confirmBatchSnapshot({ ...workspace, clients: [{ ...client, deletedAt: now }] }, review, now)).toThrow('vínculos')
  })

  it('faz uma única escrita e mantém mesmos IDs para retry após quota, sem gravação parcial', async () => {
    const workspace = useWorkspace()
    workspace.prepareBatch({ clients: draft.clients, contracts: draft.contracts })
    const ids = workspace.batchReview.value!.ids
    mocks.setItem.mockClear().mockImplementationOnce(() => { throw new Error('quota') })
    expect(await workspace.confirmBatch()).toBeNull()
    expect(workspace.state.value.clients).toHaveLength(0)
    expect(workspace.state.value.contracts).toHaveLength(0)
    expect(workspace.batchReview.value!.ids).toEqual(ids)
    expect(mocks.setItem).toHaveBeenCalledTimes(1)
    mocks.setItem.mockClear()
    const result = await workspace.confirmBatch()
    expect(result?.clients).toHaveLength(2)
    expect(result?.contracts).toHaveLength(1)
    expect(result?.clients[0]?.id).toBe(ids.ana)
    expect(mocks.setItem).toHaveBeenCalledTimes(1)
    expect(mocks.setItem.mock.calls[0]?.[0]).toBe(STORAGE_KEY)
    expect(await workspace.confirmBatch()).toBeNull()
    expect(mocks.setItem).toHaveBeenCalledTimes(1)
  })

  it('bloqueia duplo clique e sessão encerrada, conservando o rascunho do lote', async () => {
    const workspace = useWorkspace()
    workspace.prepareBatch({ clients: draft.clients, contracts: draft.contracts })
    let release!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { release = resolve })))
    mocks.setItem.mockClear()
    const pending = workspace.confirmBatch()
    expect(await workspace.confirmBatch()).toBeNull()
    release(new Response(JSON.stringify({ authenticated: false })))
    expect(await pending).toBeNull()
    expect(mocks.setItem).not.toHaveBeenCalled()
    expect(workspace.batchDraft.value).not.toBeNull()
    expect(workspace.batchReview.value).toBeNull()
  })

  it('atualiza somente revisão esperada e pede descarte ao alternar rascunhos', async () => {
    const workspace = useWorkspace()
    workspace.prepareBatch({ clients: [{ ref: 'ana' }], contracts: [] })
    const current = workspace.batchDraft.value!
    expect(workspace.prepareBatch({ batchId: current.batchId, expectedRevision: 99, clients: draft.clients, contracts: [] })).toBe(false)
    expect(workspace.prepareBatch({ batchId: current.batchId, expectedRevision: 0, clients: draft.clients, contracts: [] })).toBe(true)
    expect(workspace.batchDraft.value?.revision).toBe(1)
    mocks.confirm.mockReturnValue(false)
    expect(await workspace.openDraft('client')).toBe(false)
    expect(workspace.batchDraft.value).not.toBeNull()
    mocks.confirm.mockReturnValue(true)
    expect(await workspace.openDraft('client')).toBe(true)
    expect(workspace.batchDraft.value).toBeNull()
    mocks.confirm.mockReturnValue(false)
    expect(workspace.prepareBatch({ clients: draft.clients, contracts: [] })).toBe(false)
    expect(workspace.state.value.draft).not.toBeNull()
  })
  it('reabre revisão após cancelar e rejeita confirmação alterada durante a sessão', async () => {
    const workspace = useWorkspace()
    workspace.prepareBatch({ clients: draft.clients, contracts: draft.contracts })
    workspace.cancelBatchReview()
    expect(workspace.batchDraft.value).not.toBeNull()
    expect(workspace.batchReview.value).toBeNull()
    expect(workspace.requestBatchReview()).toBe(true)
    let release!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { release = resolve })))
    mocks.setItem.mockClear()
    const pending = workspace.confirmBatch()
    workspace.clearReview()
    release(new Response(JSON.stringify({ authenticated: true })))
    expect(await pending).toBeNull()
    expect(mocks.setItem).not.toHaveBeenCalled()
    expect(workspace.state.value.clients).toHaveLength(0)
    expect(workspace.batchDraft.value).not.toBeNull()
  })

  it('completa valor e data sem apagar campos e itens omitidos, confirmando vínculos corretos', async () => {
    const workspace = useWorkspace()
    workspace.prepareBatch({ clients: [{ ref: 'ana', name: 'Ana', email: 'ana@example.com' }, { ref: 'bia', name: 'Bia' }], contracts: [{ ref: 'servico', clientRef: 'ana', title: 'Serviço' }] })
    const current = workspace.batchDraft.value!
    expect(workspace.prepareBatch({ batchId: current.batchId, expectedRevision: 0, clients: [{ ref: 'ana' }], contracts: [{ ref: 'servico', valueCents: 100, startDate: '2026-11-13' }] })).toBe(true)
    expect(workspace.batchDraft.value?.clients).toEqual([{ ref: 'ana', name: 'Ana', email: 'ana@example.com' }, { ref: 'bia', name: 'Bia' }])
    expect(workspace.batchDraft.value?.contracts[0]).toMatchObject({ ref: 'servico', clientRef: 'ana', title: 'Serviço', valueCents: 100, startDate: '2026-11-13' })
    expect(workspace.batchReview.value).not.toBeNull()
    const result = await workspace.confirmBatch()
    expect(result?.clients.map(({ name }) => name)).toEqual(['Ana', 'Bia'])
    expect(result?.clients[0]?.email).toBe('ana@example.com')
    expect(result?.contracts[0]?.clientId).toBe(result?.clients[0]?.id)
    expect(result?.contracts[0]?.title).toBe('Serviço')
  })

  it('preserva ordem ao acrescentar e rejeita total após merge sem alterar lote anterior', () => {
    const workspace = useWorkspace()
    workspace.prepareBatch({ clients: Array.from({ length: 9 }, (_, n) => ({ ref: `p${n}`, name: `Pessoa ${n}` })), contracts: [] })
    const current = workspace.batchDraft.value!
    expect(workspace.prepareBatch({ batchId: current.batchId, expectedRevision: 0, clients: [{ ref: 'p9', name: 'Pessoa 9' }], contracts: [] })).toBe(true)
    expect(workspace.batchDraft.value?.clients.map(({ ref }) => ref)).toEqual(Array.from({ length: 10 }, (_, n) => `p${n}`))
    const before = workspace.batchDraft.value
    expect(workspace.prepareBatch({ batchId: current.batchId, expectedRevision: 1, clients: [{ ref: 'p10', name: 'Pessoa 10' }], contracts: [] })).toBe(false)
    expect(workspace.batchDraft.value).toEqual(before)
    expect(workspace.batchReview.value).not.toBeNull()
  })

  it('permite limpar campo explicitamente sem apagar item e invalida revisão com nome vazio', () => {
    const workspace = useWorkspace()
    workspace.prepareBatch({ clients: [{ ref: 'ana', name: 'Ana', email: 'ana@example.com' }], contracts: [] })
    const current = workspace.batchDraft.value!
    workspace.prepareBatch({ batchId: current.batchId, expectedRevision: 0, clients: [{ ref: 'ana', email: '' }], contracts: [] })
    expect(workspace.batchDraft.value?.clients[0]).toMatchObject({ name: 'Ana', email: '' })
    workspace.prepareBatch({ batchId: current.batchId, expectedRevision: 1, clients: [{ ref: 'ana', name: '' }], contracts: [] })
    expect(workspace.batchDraft.value?.clients).toHaveLength(1)
    expect(workspace.batchReview.value).toBeNull()
    expect(workspace.batchIssues.value.length).toBeGreaterThan(0)
  })

})
