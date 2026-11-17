import { describe, expect, it } from 'vitest'
import { confirmSnapshot, createReview } from '../../app/utils/review'
import { emptyWorkspace } from '../../app/utils/storage'
import type { Draft } from '../../shared/types'

const draft: Draft = { entity: 'client', draftId: '00000000-0000-4000-8000-000000000001', revision: 1, fields: { name: ' Ana ' } }
const now = '2026-11-13T12:00:00.000Z'

describe('revisão vinculada ao conteúdo', () => {
  it('salva o snapshot validado com id do draft e deduplica', () => {
    const workspace = { ...emptyWorkspace(), draft }
    const review = createReview(draft, workspace)
    expect(review.snapshot).toEqual({ name: 'Ana', email: '', phone: '' })
    expect(Object.isFrozen(review.snapshot)).toBe(true)
    const saved = confirmSnapshot(workspace, review, now)
    expect(saved.record.id).toBe(draft.draftId)
    expect(saved.workspace.draft).toBeNull()
    expect(confirmSnapshot(saved.workspace, review, now).workspace.clients).toHaveLength(1)
    expect(workspace.clients).toHaveLength(0)
  })

  it('bloqueia revisão obsoleta e alterações no snapshot', () => {
    const workspace = { ...emptyWorkspace(), draft }
    const review = createReview(draft, workspace)
    expect(() => confirmSnapshot({ ...workspace, draft: { ...draft, revision: 2 } }, review, now)).toThrow()
    expect(() => confirmSnapshot({ ...workspace, draft: { ...draft, fields: { name: 'Outra' } } }, review, now)).toThrow()
  })

  it('bloqueia cliente inexistente e datas cruzadas sem apagar rascunho', () => {
    const contract: Draft = { entity: 'contract', draftId: draft.draftId, revision: 0, fields: { clientId: draft.draftId, title: 'Teste', valueCents: 100, startDate: '2026-11-13', endDate: '2026-11-12', status: 'draft' } }
    expect(() => createReview(contract, emptyWorkspace())).toThrow()
    expect(() => createReview({ ...contract, fields: { ...contract.fields, endDate: '' } }, emptyWorkspace())).toThrow('cliente')
    expect(contract.fields.endDate).toBe('2026-11-12')
  })
})

describe('edição sem duplicação', () => {
  it('preserva ID e criação, incrementa revisão e bloqueia confirmação repetida', () => {
    const original = { id: draft.draftId, name: 'Ana', email: '', phone: '', createdAt: now }
    const edit: Draft = { ...draft, draftId: '00000000-0000-4000-8000-000000000002', recordId: original.id, recordRevision: 0, fields: { name: 'Ana editada' } }
    const workspace = { ...emptyWorkspace(), clients: [original], draft: edit }
    const review = createReview(edit, workspace)
    const saved = confirmSnapshot(workspace, review, '2026-11-14T12:00:00.000Z')
    expect(saved.workspace.clients).toHaveLength(1)
    expect(saved.record).toMatchObject({ id: original.id, createdAt: now, name: 'Ana editada', revision: 1, updatedAt: '2026-11-14T12:00:00.000Z' })
    expect(() => confirmSnapshot(saved.workspace, review, now)).toThrow()
    expect(() => confirmSnapshot({ ...workspace, clients: [{ ...original, revision: 1 }] }, review, now)).toThrow()
    expect(() => confirmSnapshot({ ...workspace, clients: [{ ...original, deletedAt: now, deletionBatchId: edit.draftId }] }, review, now)).toThrow()
  })

  it('conta registros da lixeira no limite e permite editar no limite', () => {
    const clients = Array.from({ length: 200 }, (_, n) => ({ id: `00000000-0000-4000-8000-${String(n + 10).padStart(12, '0')}`, name: 'Cliente', email: '', phone: '', createdAt: now, deletedAt: now, deletionBatchId: draft.draftId }))
    const workspace = { ...emptyWorkspace(), clients, draft }
    expect(() => confirmSnapshot(workspace, createReview(draft, workspace), now)).toThrow('200')
  })
})
