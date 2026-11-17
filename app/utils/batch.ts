import type { ZodError } from 'zod'
import { batchDraftSchema, clientFieldsSchema, contractFieldsSchema, workspaceSchema } from '#shared/schemas'
import type { BatchDraft, BatchReview, Client, Contract, Workspace } from '#shared/types'

const placeholder = '00000000-0000-4000-8000-000000000001'
const fieldLabels: Record<string, string> = { name: 'nome', email: 'e-mail', phone: 'telefone', title: 'título', valueCents: 'valor positivo em centavos', startDate: 'data de início', endDate: 'data de término', status: 'status', clientId: 'cliente' }

export function mergeBatchItems<T extends { ref: string }>(previous: T[], updates: T[]): T[] {
  const refs = new Set(previous.map(({ ref }) => ref))
  return [
    ...previous.map(item => {
      const patch = updates.find(({ ref }) => ref === item.ref)
      return patch ? { ...item, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) } : item
    }),
    ...updates.filter(({ ref }) => !refs.has(ref)),
  ]
}

export function batchIssuesFor(draft: BatchDraft, workspace: Workspace): string[] {
  const clients = new Set(draft.clients.map(({ ref }) => ref))
  const issuesFor = (result: { success: true } | { success: false; error: ZodError }, label: string) => result.success ? []
    : result.error.issues.map(({ path }) => `${label}: confira ${fieldLabels[String(path[0])] ?? 'os dados'}.`)
  const clientIssues = draft.clients.flatMap(({ ref, ...fields }) => issuesFor(clientFieldsSchema.safeParse(fields), fields.name || `Cliente ${ref}`))
  const contractIssues = draft.contracts.flatMap(({ ref, clientRef, ...fields }) => {
    const label = fields.title || `Contrato ${ref}`
    const linked = clientRef && (clients.has(clientRef) || workspace.clients.some(({ id, deletedAt }) => id === clientRef && !deletedAt))
    return [
      ...issuesFor(contractFieldsSchema.safeParse({ ...fields, clientId: placeholder }), label),
      ...(linked ? [] : [`${label}: informe o cliente deste contrato.`]),
    ]
  })
  return [...new Set([...clientIssues, ...contractIssues])]
}

export function createBatchReview(input: BatchDraft, workspace: Workspace): BatchReview {
  const draft = batchDraftSchema.parse(input)
  if (batchIssuesFor(draft, workspace).length) throw new Error('Complete os dados do lote antes de confirmar.')
  const snapshot = Object.freeze({ ...draft,
    clients: Object.freeze(draft.clients.map(item => Object.freeze({ ...item }))),
    contracts: Object.freeze(draft.contracts.map(item => Object.freeze({ ...item }))),
  }) as unknown as BatchDraft
  const ids = Object.freeze(Object.fromEntries([...draft.clients, ...draft.contracts].map(({ ref }) => [ref, crypto.randomUUID()])))
  return Object.freeze({ batchId: draft.batchId, revision: draft.revision, snapshot, ids })
}

export function confirmBatchSnapshot(workspace: Workspace, review: BatchReview, now: string): { workspace: Workspace; clients: Client[]; contracts: Contract[] } {
  const { batchDraft: draft } = workspace
  if (!draft || draft.batchId !== review.batchId || draft.revision !== review.revision || JSON.stringify(batchDraftSchema.parse(draft)) !== JSON.stringify(review.snapshot)) throw new Error('O lote mudou. Revise novamente.')
  const parsed = batchDraftSchema.parse(draft)
  if (batchIssuesFor(parsed, workspace).length) throw new Error('O lote contém dados ou vínculos inválidos. Revise novamente.')
  const refs = [...parsed.clients, ...parsed.contracts].map(({ ref }) => ref)
  const ids = refs.map(ref => Object.hasOwn(review.ids, ref) ? review.ids[ref] : undefined)
  const existingIds = new Set([...workspace.clients, ...workspace.contracts].map(({ id }) => id))
  if (Object.keys(review.ids).length !== refs.length || new Set(ids).size !== refs.length || ids.some(id => !id || existingIds.has(id))) throw new Error('Identificadores do lote inválidos. Revise novamente.')
  if (workspace.clients.length + parsed.clients.length > 200 || workspace.contracts.length + parsed.contracts.length > 200) throw new Error('Limite de 200 cadastros atingido, incluindo a lixeira.')
  const clients = parsed.clients.map(({ ref, ...fields }) => ({ ...clientFieldsSchema.parse(fields), id: review.ids[ref]!, createdAt: now, revision: 0 }))
  const clientRefs = new Set(parsed.clients.map(({ ref }) => ref))
  const contracts = parsed.contracts.map(({ ref, clientRef, ...fields }) => ({
    ...contractFieldsSchema.parse({ ...fields, clientId: clientRefs.has(clientRef!) ? review.ids[clientRef!] : clientRef }),
    id: review.ids[ref]!, createdAt: now, revision: 0,
  }))
  const next = workspaceSchema.parse({ ...workspace, clients: [...workspace.clients, ...clients], contracts: [...workspace.contracts, ...contracts], batchDraft: null })
  return { workspace: next, clients, contracts }
}
