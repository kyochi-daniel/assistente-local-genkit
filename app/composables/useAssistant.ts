import { nextTick } from 'vue'
import { navigateTo, useNuxtApp, useState } from '#imports'
import { toolCallSchema } from '#shared/schemas'
import type { Ack, Screen, TechnicalMessage, ToolCall } from '#shared/types'
import { matchesDraft, pathForScreen, screenFromPath } from '../utils/actions'
import { fitRequest, readEvents } from '../utils/stream'
import { useWorkspace } from './useWorkspace'
import { useModelSettings } from './useModelSettings'

const controllers = new WeakMap<object, AbortController>()

export function useAssistant() {
  const workspace = useWorkspace()
  const modelSettings = useModelSettings()
  const app = useNuxtApp()
  const busy = useState('assistant-busy', () => false)
  const status = useState('assistant-status', () => 'idle')
  const error = useState('assistant-error', () => '')
  const text = useState('assistant-text', () => '')
  const navigation = useState<{ screen: Screen; label: string } | null>('assistant-navigation', () => null)
  const modelLabel = useState('assistant-model', () => '')
  const fallbackUsed = useState('assistant-fallback', () => false)
  const activeTurn = useState<string | null>('assistant-turn', () => null)
  const acknowledgements = useState<Record<string, Ack>>('assistant-acks', () => ({}))
  const screen = (): Screen => screenFromPath(app.$router.currentRoute.value.path)
  const active = (turnId: string): boolean => activeTurn.value === turnId && !controllers.get(app)?.signal.aborted

  function stop(): void {
    activeTurn.value = null
    controllers.get(app)?.abort()
    controllers.delete(app)
    acknowledgements.value = {}
    busy.value = false
    text.value = ''
    navigation.value = null
    status.value = 'cancelled'
  }

  async function paintNavigation(signal: AbortSignal): Promise<void> {
    await nextTick()
    if (signal.aborted || typeof window === 'undefined' || !window.requestAnimationFrame) return
    await new Promise<void>((resolve) => {
      let frame = 0
      const finish = () => {
        window.cancelAnimationFrame(frame)
        signal.removeEventListener('abort', finish)
        resolve()
      }
      signal.addEventListener('abort', finish, { once: true })
      frame = window.requestAnimationFrame(() => { frame = window.requestAnimationFrame(finish) })
    })
  }

  async function execute(call: ToolCall, turnId: string, deadlineAt: number): Promise<Ack> {
    const cached = acknowledgements.value[call.actionId]
    if (cached) return cached
    const result: Ack = { actionId: call.actionId, ref: call.ref, status: 'success', screen: screen(), draft: workspace.state.value.draft }
    try {
      const parsed = toolCallSchema.safeParse(call)
      if (!parsed.success) { result.status = 'rejected'; result.code = 'INVALID_ACTION' }
      else if (!active(turnId) || Date.now() >= deadlineAt) { result.status = 'rejected'; result.code = 'USER_REJECTED' }
      else if (call.name === 'navigate') {
        const { screen: destination, recordId } = call.input
        const entity = destination.startsWith('client-') ? 'client' : destination.startsWith('contract-') ? 'contract' : null
        const editing = destination.endsWith('-edit')
        const opened = !entity || (editing ? await workspace.openEdit(entity, recordId!) : await workspace.openDraft(entity))
        if (!opened) { result.status = 'rejected'; result.code = 'USER_REJECTED' }
        else if (active(turnId) && Date.now() < deadlineAt) {
          const label = editing ? 'Preparando edição…' : destination.startsWith('client') ? 'Abrindo clientes…'
            : destination.startsWith('contract') ? 'Abrindo contratos…' : destination === 'trash' ? 'Abrindo lixeira…' : destination === 'settings' ? 'Abrindo configurações…' : 'Abrindo assistente…'
          navigation.value = { screen: destination, label }
          await paintNavigation(controllers.get(app)!.signal)
          if (!active(turnId) || Date.now() >= deadlineAt) { result.status = 'rejected'; result.code = 'USER_REJECTED' }
          else await navigateTo(pathForScreen(destination, recordId))
          if (result.status === 'success' && screen() !== destination) { result.status = 'error'; result.code = 'NAVIGATION_FAILED' }
        } else { result.status = 'rejected'; result.code = 'USER_REJECTED' }
      } else if (call.name === 'prepare-batch') {
        if (!workspace.prepareBatch(call.input)) { result.status = 'rejected'; result.code = 'INVALID_ACTION' }
      } else if (call.name === 'request-delete') {
        const records = call.input.entity === 'client' ? workspace.state.value.clients : workspace.state.value.contracts
        const record = records.find(({ id }) => id === call.input.recordId)
        if (!record || record.deletedAt || (record.revision ?? 0) !== call.input.expectedRevision) { result.status = 'rejected'; result.code = 'STALE_DRAFT' }
        else if (!workspace.requestDelete(call.input.entity, call.input.recordId)) { result.status = 'rejected'; result.code = 'INVALID_ACTION' }
      } else if (!matchesDraft(workspace.state.value.draft, call.input)) {
        result.status = 'rejected'; result.code = 'STALE_DRAFT'
      } else if (call.name === 'patch-draft') {
        const expectedScreen = `${call.input.entity}-${workspace.state.value.draft?.recordId ? 'edit' : 'new'}`
        if (screen() !== expectedScreen || !workspace.updateDraft(call.input.fields)) { result.status = 'rejected'; result.code = 'INVALID_ACTION' }
      } else if (!workspace.requestReview()) { result.status = 'rejected'; result.code = 'INVALID_ACTION' }
    } catch { result.status = 'error'; result.code = 'NAVIGATION_FAILED' }
    finally { if (activeTurn.value === turnId) navigation.value = null }
    const ack = { ...result, screen: screen(), draft: workspace.state.value.draft }
    acknowledgements.value = { ...acknowledgements.value, [call.actionId]: ack }
    return ack
  }

  async function send(message: string): Promise<void> {
    if (busy.value || workspace.saving.value) return
    const input = message.trim()
    if (!input || input.length > 4000) { error.value = 'Envie uma mensagem de até 4.000 caracteres.'; return }
    workspace.init()
    modelSettings.init()
    const modelSelection = modelSettings.selection.value ? { ...modelSettings.selection.value } : undefined
    const turnId = crypto.randomUUID()
    const abort = new AbortController()
    controllers.set(app, abort)
    activeTurn.value = turnId
    busy.value = true
    status.value = 'thinking'
    error.value = ''; text.value = ''; fallbackUsed.value = false
    const deadlineAt = Date.now() + 60_000
    const timer = setTimeout(() => abort.abort(), 60_000)
    const visibleHistory = workspace.state.value.messages.map(({ role, text: content }) => ({ role, text: content }))
    workspace.addMessage('user', input)
    let technicalHistory: TechnicalMessage[] = []
    let pending: Ack | null = null
    try {
      for (let round = 1; round <= 6; round += 1) {
        if (!active(turnId) || Date.now() >= deadlineAt) throw new Error('TIMEOUT')
        const request = {
          turnId, round, deadlineAt, visibleHistory, technicalHistory,
          ...(modelSelection ? { modelSelection } : {}),
          context: {
            screen: screen(), draft: workspace.state.value.draft, batchDraft: workspace.batchDraft.value,
            clients: workspace.activeClients.value.map(({ id, name, revision }) => ({ id, name, revision: revision ?? 0 })),
            contracts: workspace.activeContracts.value.map(({ id, title, clientId, revision }) => ({ id, title, clientId, revision: revision ?? 0 })),
          },
          ...(pending ? { kind: 'continue', ack: pending } : { kind: 'message', text: input }),
        }
        const response = await fetch('/api/chat', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: fitRequest(request), signal: abort.signal })
        if (!response.ok || !response.body) {
          if (response.status === 401) workspace.clearReview()
          if (response.status === 503) {
            status.value = 'error'
            error.value = 'O assistente ainda não foi configurado neste ambiente. Você pode usar os formulários.'
            return
          }
          throw new Error('REQUEST_FAILED')
        }
        let terminal = false
        let call: ToolCall | null = null
        let reason = ''
        text.value = ''
        for await (const event of readEvents(response.body)) {
          if (!active(turnId)) return
          if (event.turnId !== turnId) continue
          if (event.type === 'text_delta') text.value = `${text.value}${event.text}`.slice(0, 4000)
          else if (event.type === 'model_selected') { modelLabel.value = event.model; fallbackUsed.value = event.fallback }
          else if (event.type === 'action_requested') {
            if (call) throw new Error('MULTIPLE_ACTIONS')
            call = event.call
          } else if (event.type === 'error') { error.value = event.message; throw new Error(event.code) }
          else if (event.type === 'turn_end') {
            technicalHistory = event.technicalHistory
            reason = event.reason
            terminal = true
            break
          }
        }
        if (!active(turnId)) return
        if (!terminal) throw new Error('STREAM_INTERRUPTED')
        if (text.value.trim()) workspace.addMessage('assistant', text.value)
        text.value = ''
        if (call) {
          status.value = 'executing'
          pending = await execute(call, turnId, deadlineAt)
          if (!active(turnId)) return
          const success = pending.status === 'success'
          if (!success) workspace.addMessage('assistant', 'Ação não concluída. Tente novamente.')
          else if (call.name === 'request-review' || call.name === 'request-delete') workspace.addMessage('assistant', 'Confira os dados para confirmar.')
          if (call.name === 'prepare-batch') {
            if (success) workspace.addMessage('assistant', workspace.batchIssues.value.length
              ? `${workspace.batchIssues.value[0]} Qual é esse dado?`
              : 'Confira o lote para confirmar.')
            status.value = success ? workspace.batchReview.value ? 'awaiting_confirmation' : 'awaiting_input' : 'error'
            return
          }
          if (call.name === 'request-review' || call.name === 'request-delete') { status.value = success ? 'awaiting_confirmation' : 'error'; return }
          if (round === 6) { status.value = 'awaiting_input'; workspace.addMessage('assistant', 'Limite de etapas atingido. Envie uma nova mensagem para continuar.'); return }
          if (reason !== 'awaiting_ack') throw new Error('INVALID_STREAM')
          status.value = 'thinking'
        } else {
          if (reason === 'awaiting_ack') throw new Error('INVALID_STREAM')
          status.value = reason === 'complete' ? 'completed' : 'awaiting_input'
          return
        }
      }
    } catch {
      if (activeTurn.value !== turnId) return
      status.value = 'error'
      error.value = abort.signal.aborted ? 'Tempo do turno esgotado. Envie uma nova mensagem.' : error.value || 'Não foi possível concluir o turno. O rascunho foi mantido; tente novamente.'
    } finally {
      clearTimeout(timer)
      if (activeTurn.value === turnId) { activeTurn.value = null; controllers.delete(app); busy.value = false; navigation.value = null }
    }
  }

  return { send, stop, busy, status, text, error, navigation, modelLabel, fallbackUsed }
}
