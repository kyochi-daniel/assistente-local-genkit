import { clientFieldsSchema, contractFieldsSchema } from '#shared/schemas'
import type { Draft, Review, Workspace, Client, Contract } from '#shared/types'

export function createReview(draft: Draft, workspace: Workspace): Review {
  const snapshot = draft.entity === 'client'
    ? clientFieldsSchema.parse(draft.fields)
    : contractFieldsSchema.parse(draft.fields)
  if (draft.entity === 'contract' && !workspace.clients.some(({ id, deletedAt }) => !deletedAt && id === (snapshot as { clientId: string }).clientId)) {
    throw new Error('Selecione um cliente existente e ativo.')
  }
  if (draft.recordId) {
    const records = draft.entity === 'client' ? workspace.clients : workspace.contracts
    const record = records.find(({ id }) => id === draft.recordId)
    if (!record || record.deletedAt || (record.revision ?? 0) !== draft.recordRevision) throw new Error('O cadastro mudou. Abra a edição novamente.')
  }
  return {
    draftId: draft.draftId, revision: draft.revision, entity: draft.entity,
    ...(draft.recordId ? { recordId: draft.recordId, recordRevision: draft.recordRevision } : {}),
    snapshot: Object.freeze({ ...snapshot }),
  } as Review
}

export function confirmSnapshot(workspace: Workspace, review: Review, now: string): { workspace: Workspace; record: Client | Contract } {
  const { draft } = workspace
  if (!review.recordId) {
    const records = review.entity === 'client' ? workspace.clients : workspace.contracts
    const existing = records.find(({ id }) => id === review.draftId)
    if (existing && !existing.deletedAt) return { workspace, record: existing }
  }
  if (!draft || draft.draftId !== review.draftId || draft.revision !== review.revision) throw new Error('A revisão mudou. Revise novamente.')
  const current = createReview(draft, workspace)
  if (JSON.stringify(current) !== JSON.stringify(review)) throw new Error('A revisão mudou. Revise novamente.')
  const collection = draft.entity === 'client' ? 'clients' : 'contracts'
  if (draft.recordId) {
    const previous = workspace[collection].find(({ id }) => id === draft.recordId)!
    const record = { ...previous, ...current.snapshot, revision: (previous.revision ?? 0) + 1, updatedAt: now } as Client | Contract
    return { workspace: { ...workspace, [collection]: workspace[collection].map(item => item.id === record.id ? record : item), draft: null }, record }
  }
  if (workspace[collection].length >= 200) throw new Error('Limite de 200 cadastros atingido, incluindo a lixeira.')
  const record = { ...current.snapshot, id: draft.draftId, createdAt: now, revision: 0 } as Client | Contract
  return { workspace: { ...workspace, [collection]: [...workspace[collection], record], draft: null }, record }
}
