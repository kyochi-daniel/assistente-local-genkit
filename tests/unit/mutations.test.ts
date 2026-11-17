import { describe, expect, it } from 'vitest'
import { createMutationReview, confirmMutationSnapshot } from '../../app/utils/mutations'
import { emptyWorkspace } from '../../app/utils/storage'
import type { Workspace } from '../../shared/types'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const now = '2026-11-13T12:00:00.000Z'
const workspace: Workspace = {
  ...emptyWorkspace(),
  clients: [{ id: id(1), name: 'Ana', email: '', phone: '', createdAt: now }],
  contracts: [2, 3].map(n => ({ id: id(n), clientId: id(1), title: `Contrato ${n}`, valueCents: 100, startDate: '2026-11-13', endDate: '', status: 'active', createdAt: now })),
}

describe('lixeira e impacto confirmado', () => {
  it('exclui cliente com contratos ativos e restaura somente o mesmo lote', () => {
    const previous = confirmMutationSnapshot(workspace, createMutationReview(workspace, 'delete', 'contract', id(3)), now)
    const review = createMutationReview(previous, 'delete', 'client', id(1))
    expect(review.affected.map(item => item.id)).toEqual([id(2)])
    expect(Object.isFrozen(review.affected)).toBe(true)
    const deleted = confirmMutationSnapshot(previous, review, now)
    expect(deleted.clients[0]?.deletedAt).toBe(now)
    expect(deleted.contracts[0]?.deletionBatchId).toBe(review.batchId)
    expect(deleted.contracts).toHaveLength(2)
    expect(workspace.clients[0]?.deletedAt).toBeUndefined()
    expect(() => createMutationReview(deleted, 'restore', 'contract', id(2))).toThrow('cliente')
    const restore = createMutationReview(deleted, 'restore', 'client', id(1))
    expect(restore.affected).toHaveLength(1)
    const restored = confirmMutationSnapshot(deleted, restore, now)
    expect(restored.clients[0]?.deletedAt).toBeUndefined()
    expect(restored.clients[0]?.revision).toBe(2)
    expect(restored.contracts[0]?.deletedAt).toBeUndefined()
    expect(restored.contracts[1]?.deletedAt).toBe(now)
    expect(() => confirmMutationSnapshot(restored, restore, now)).toThrow()
  })

  it('rejeita mudanças de revisão, vínculos e impacto antes do commit', () => {
    const review = createMutationReview(workspace, 'delete', 'client', id(1))
    expect(() => confirmMutationSnapshot({ ...workspace, clients: workspace.clients.map(item => ({ ...item, revision: 1 })) }, review, now)).toThrow()
    expect(() => confirmMutationSnapshot({ ...workspace, contracts: workspace.contracts.map(item => ({ ...item, revision: 1 })) }, review, now)).toThrow()
    expect(() => confirmMutationSnapshot({ ...workspace, contracts: [] }, review, now)).toThrow()
    expect(() => confirmMutationSnapshot(workspace, { ...review, affected: [] }, now)).toThrow()
  })

  it('restaura contrato isolado apenas com cliente ativo', () => {
    const deleted = confirmMutationSnapshot(workspace, createMutationReview(workspace, 'delete', 'contract', id(2)), now)
    const restored = confirmMutationSnapshot(deleted, createMutationReview(deleted, 'restore', 'contract', id(2)), now)
    expect(restored.contracts[0]?.revision).toBe(2)
    expect(restored.contracts[0]?.deletionBatchId).toBeUndefined()
    expect(restored.clients).toEqual(workspace.clients)
  })
})
