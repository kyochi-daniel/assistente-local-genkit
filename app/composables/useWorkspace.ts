import { computed } from 'vue'
import { useState } from '#imports'
import { ZodError } from 'zod'
import type { Draft, Entity, Review, MutationReview, Workspace, BatchReview, PrepareBatchInput } from '#shared/types'
import { emptyWorkspace, readWorkspace, writeWorkspace } from '../utils/storage'
import { batchIssuesFor, createBatchReview, confirmBatchSnapshot, mergeBatchItems } from '../utils/batch'
import { batchDraftSchema, prepareBatchInputSchema } from '#shared/schemas'
import { createMutationReview, confirmMutationSnapshot } from '../utils/mutations'
import { clientFieldsSchema, contractFieldsSchema } from '#shared/schemas'
import { patchDraft } from '../utils/actions'
import { confirmSnapshot, createReview } from '../utils/review'

export function useWorkspace() {
  const state = useState<Workspace>('workspace', emptyWorkspace)
  const hydrated = useState('workspace-hydrated', () => false)
  const blocked = useState('workspace-blocked', () => false)
  const error = useState('workspace-error', () => '')
  const fieldErrors = useState<Record<string, string>>('workspace-fields-error', () => ({}))
  const review = useState<Review | null>('workspace-review', () => null)
  const mutationReview = useState<MutationReview | null>('workspace-mutation-review', () => null)
  const batchReview = useState<BatchReview | null>('workspace-batch-review', () => null)
  const batchDraft = computed(() => state.value.batchDraft ?? null)
  const batchIssues = computed(() => batchDraft.value ? batchIssuesFor(batchDraft.value, state.value) : [])
  const activeClients = computed(() => state.value.clients.filter(record => !record.deletedAt))
  const activeContracts = computed(() => state.value.contracts.filter(record => !record.deletedAt))
  const deletedClients = computed(() => state.value.clients.filter(record => record.deletedAt))
  const deletedContracts = computed(() => state.value.contracts.filter(record => record.deletedAt))
  const saving = useState('workspace-saving', () => false)
  const assistantBusy = useState('assistant-busy', () => false)
  const historyTrimmed = useState('workspace-history-trimmed', () => false)

  function showFieldErrors(cause: unknown): void {
    fieldErrors.value = cause instanceof ZodError
      ? Object.fromEntries(cause.issues.map(({ path, message }) => [String(path[path.length - 1] ?? 'form'), message]))
      : { clientId: 'Selecione um cliente existente.' }
  }

  function init(): void {
    if (!process.client || hydrated.value) return
    try { state.value = readWorkspace(localStorage) }
    catch { blocked.value = true; error.value = 'Dados locais inválidos ou indisponíveis. Preserve os dados e recupere o armazenamento antes de gravar.' }
    hydrated.value = true
  }

  function persist(next: Workspace, requireWrite = false): boolean {
    if (!process.client || !hydrated.value || blocked.value) {
      error.value = 'Armazenamento local indisponível. Nenhum cadastro foi salvo.'
      if (!requireWrite && hydrated.value) state.value = next
      return false
    }
    try { writeWorkspace(localStorage, next); state.value = next; error.value = ''; return true }
    catch {
      if (!requireWrite) state.value = next
      error.value = 'Não foi possível gravar no navegador. O rascunho foi mantido.'
      return false
    }
  }

  async function openDraft(entity: Entity): Promise<boolean> {
    if (saving.value) return false
    init()
    const { draft } = state.value
    if (!batchDraft.value && draft?.entity === entity && !draft.recordId) return true
    const hasWork = draft && Object.entries(draft.fields).some(([key, value]) => key === 'status' ? value !== 'draft' : value !== '' && value !== undefined)
    if ((hasWork || batchDraft.value) && (!process.client || !window.confirm('Descartar o rascunho atual e iniciar outro cadastro?'))) return false
    const next = { draftId: crypto.randomUUID(), entity, revision: 0, fields: entity === 'contract' ? { status: 'draft' } : {} } as Draft
    clearReview()
    fieldErrors.value = {}
    persist({ ...state.value, draft: next, batchDraft: null })
    return true
  }

  function updateDraft(fields: unknown): boolean {
    const { draft } = state.value
    if (!draft || saving.value) return false
    try {
      const next = patchDraft(draft, fields)
      if (next === draft) return true
      clearReview()
      fieldErrors.value = {}
      persist({ ...state.value, draft: next })
      return true
    } catch (cause) { showFieldErrors(cause); error.value = 'Campos inválidos. Confira formato e tamanho dos valores.'; return false }
  }

  function requestReview(): boolean {
    if (!state.value.draft || saving.value) return false
    try { clearReview(); review.value = createReview(state.value.draft, state.value); fieldErrors.value = {}; error.value = ''; return true }
    catch (cause) { showFieldErrors(cause); review.value = null; error.value = 'Preencha os campos obrigatórios e confira cliente, valor e datas.'; return false }
  }

  const clearReview = () => { review.value = null; mutationReview.value = null; batchReview.value = null }
  const cancelReview = clearReview

  function discardDraft(): boolean {
    if (saving.value) return false
    clearReview()
    persist({ ...state.value, draft: null })
    return true
  }

  async function confirmReview() {
    const pending = review.value
    if (!pending || saving.value || assistantBusy.value) return null
    saving.value = true
    try {
      const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
      if (!response.ok || !(await response.json()).authenticated) {
        clearReview(); error.value = 'Sessão encerrada. Entre novamente e revise o cadastro.'; return null
      }
      if (review.value !== pending) throw new Error('STALE_REVIEW')
      const result = confirmSnapshot(state.value, pending, new Date().toISOString())
      if (!persist(result.workspace, true)) return null
      clearReview()
      return result.record
    } catch { clearReview(); error.value = 'Não foi possível confirmar. Confira a sessão e revise o cadastro novamente.'; return null }
    finally { saving.value = false }
  }

  async function openEdit(entity: Entity, recordId: string): Promise<boolean> {
    if (saving.value) return false
    init()
    const records = entity === 'client' ? state.value.clients : state.value.contracts
    const record = records.find(({ id }) => id === recordId)
    if (!record || record.deletedAt) { error.value = 'Cadastro indisponível para edição.'; return false }
    const { draft } = state.value
    if (!batchDraft.value && draft?.entity === entity && draft.recordId === recordId && draft.recordRevision === (record.revision ?? 0)) return true
    if ((batchDraft.value || draft && Object.keys(draft.fields).length) && (!process.client || !window.confirm('Descartar o rascunho atual e editar este cadastro?'))) return false
    const fields = entity === 'client'
      ? clientFieldsSchema.parse(Object.fromEntries(['name', 'email', 'phone'].map(key => [key, Reflect.get(record, key)])))
      : contractFieldsSchema.parse(Object.fromEntries(['clientId', 'title', 'valueCents', 'startDate', 'endDate', 'status'].map(key => [key, Reflect.get(record, key)])))
    clearReview()
    fieldErrors.value = {}
    persist({ ...state.value, batchDraft: null, draft: { draftId: crypto.randomUUID(), entity, revision: 0, recordId, recordRevision: record.revision ?? 0, fields } as Draft })
    return true
  }

  function requestMutation(action: MutationReview['action'], entity: Entity, recordId: string): boolean {
    if (saving.value) return false
    init()
    clearReview()
    try { mutationReview.value = createMutationReview(state.value, action, entity, recordId); error.value = ''; return true }
    catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível revisar a operação.'; return false }
  }

  const requestDelete = (entity: Entity, recordId: string) => requestMutation('delete', entity, recordId)
  const requestRestore = (entity: Entity, recordId: string) => requestMutation('restore', entity, recordId)

  async function confirmMutation(): Promise<boolean> {
    const pending = mutationReview.value
    if (!pending || saving.value || assistantBusy.value) return false
    saving.value = true
    try {
      const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
      if (!response.ok || !(await response.json()).authenticated) {
        clearReview(); error.value = 'Sessão encerrada. Entre novamente e revise a operação.'; return false
      }
      if (mutationReview.value !== pending) throw new Error('A revisão mudou. Revise a operação novamente.')
      const next = confirmMutationSnapshot(state.value, pending, new Date().toISOString())
      if (!persist(next, true)) return false
      clearReview()
      return true
    } catch (cause) { clearReview(); error.value = cause instanceof Error ? cause.message : 'Não foi possível confirmar a operação.'; return false }
    finally { saving.value = false }
  }

  function requestBatchReview(): boolean {
    if (!batchDraft.value || saving.value) return false
    clearReview()
    try { batchReview.value = createBatchReview(batchDraft.value, state.value); error.value = ''; return true }
    catch (cause) { error.value = cause instanceof Error ? cause.message : 'Confira os dados do lote.'; return false }
  }

  function prepareBatch(input: PrepareBatchInput): boolean {
    if (saving.value) return false
    init()
    try {
      const parsed = prepareBatchInputSchema.parse(input)
      const current = batchDraft.value
      if (parsed.batchId && (!current || current.batchId !== parsed.batchId || current.revision !== parsed.expectedRevision)) throw new Error('O lote mudou. Use os dados atuais.')
      const replacing = !parsed.batchId && current || state.value.draft
      if (replacing && (!process.client || !window.confirm('Descartar o rascunho atual e preparar este lote?'))) return false
      const next = batchDraftSchema.parse({
        batchId: parsed.batchId ?? crypto.randomUUID(), revision: parsed.batchId ? current!.revision + 1 : 0,
        clients: parsed.batchId ? mergeBatchItems(current!.clients, parsed.clients) : parsed.clients,
        contracts: parsed.batchId ? mergeBatchItems(current!.contracts, parsed.contracts) : parsed.contracts,
      })
      clearReview()
      fieldErrors.value = {}
      persist({ ...state.value, draft: null, batchDraft: next })
      if (!batchIssues.value.length) requestBatchReview()
      return true
    } catch (cause) { error.value = cause instanceof ZodError ? 'Lote inválido. Confira os campos e o limite de 10 cadastros.' : cause instanceof Error ? cause.message : 'Não foi possível preparar o lote.'; return false }
  }

  const cancelBatchReview = () => { batchReview.value = null }

  function discardBatch(): boolean {
    if (saving.value) return false
    clearReview()
    persist({ ...state.value, batchDraft: null })
    return true
  }

  async function confirmBatch() {
    const pending = batchReview.value
    if (!pending || saving.value || assistantBusy.value) return null
    saving.value = true
    try {
      const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
      if (!response.ok || !(await response.json()).authenticated) {
        clearReview(); error.value = 'Sessão encerrada. Entre novamente e revise o lote.'; return null
      }
      if (batchReview.value !== pending) throw new Error('O lote mudou. Revise novamente.')
      const result = confirmBatchSnapshot(state.value, pending, new Date().toISOString())
      if (!persist(result.workspace, true)) return null
      clearReview()
      return { clients: result.clients, contracts: result.contracts }
    } catch (cause) { clearReview(); error.value = cause instanceof Error ? cause.message : 'Não foi possível confirmar o lote.'; return null }
    finally { saving.value = false }
  }

  function addMessage(role: 'user' | 'assistant', text: string): void {
    if (!text.trim()) return
    const message = { id: crypto.randomUUID(), role, text: text.slice(0, 4000), createdAt: new Date().toISOString() }
    if (state.value.messages.length >= 40) historyTrimmed.value = true
    persist({ ...state.value, messages: [...state.value.messages, message].slice(-40) })
  }

  return { state, batchDraft, batchIssues, batchReview, prepareBatch, requestBatchReview, confirmBatch, cancelBatchReview, discardBatch, activeClients, activeContracts, deletedClients, deletedContracts, mutationReview, openEdit, requestDelete, requestRestore, confirmMutation, hydrated, error, fieldErrors, historyTrimmed, review, saving, init, openDraft, updateDraft, requestReview, cancelReview, discardDraft, confirmReview, addMessage, clearReview }
}
