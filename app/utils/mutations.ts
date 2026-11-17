import type { Client, Contract, Entity, MutationReview, Workspace } from '#shared/types'

export function createMutationReview(workspace: Workspace, action: MutationReview['action'], entity: Entity, recordId: string, batchId: string = crypto.randomUUID()): MutationReview {
  const records = entity === 'client' ? workspace.clients : workspace.contracts
  const record = records.find(({ id }) => id === recordId)
  if (!record || Boolean(record.deletedAt) !== (action === 'restore')) throw new Error('O cadastro mudou ou não está disponível.')
  if (action === 'restore' && entity === 'contract' && !workspace.clients.some(client => client.id === (record as Contract).clientId && !client.deletedAt)) {
    throw new Error('Restaure o cliente antes de restaurar este contrato.')
  }
  const affected = entity === 'client' ? workspace.contracts.filter(contract => contract.clientId === record.id && (
    action === 'delete' ? !contract.deletedAt : Boolean(record.deletionBatchId) && Boolean(contract.deletedAt) && contract.deletionBatchId === record.deletionBatchId
  )).map(({ id, revision, title }) => Object.freeze({ entity: 'contract' as const, id, revision: revision ?? 0, label: title })) : []
  return Object.freeze({
    action, entity, recordId, recordRevision: record.revision ?? 0,
    label: entity === 'client' ? (record as Client).name : (record as Contract).title,
    batchId: action === 'restore' ? record.deletionBatchId ?? batchId : batchId,
    affected: Object.freeze(affected) as unknown as MutationReview['affected'],
  })
}

export function confirmMutationSnapshot(workspace: Workspace, review: MutationReview, now: string): Workspace {
  const current = createMutationReview(workspace, review.action, review.entity, review.recordId, review.batchId)
  if (JSON.stringify(current) !== JSON.stringify(review)) throw new Error('O impacto mudou. Revise a operação novamente.')
  const update = <T extends Client | Contract>(record: T, entity: Entity): T => {
    const selected = entity === review.entity && record.id === review.recordId
      || review.affected.some(item => item.entity === entity && item.id === record.id)
    if (!selected) return record
    const metadata = { revision: (record.revision ?? 0) + 1, updatedAt: now }
    if (review.action === 'delete') return { ...record, ...metadata, deletedAt: now, deletionBatchId: review.batchId }
    const { deletedAt: _deletedAt, deletionBatchId: _batch, ...active } = record
    return { ...active, ...metadata } as T
  }
  return { ...workspace, clients: workspace.clients.map(record => update(record, 'client')), contracts: workspace.contracts.map(record => update(record, 'contract')) }
}
