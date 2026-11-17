import { createError } from 'h3'
import type { MessageData } from 'genkit'
import type { ChatRequest, TechnicalMessage, ToolCall } from '#shared/types'

export function normalizeHistory(request: ChatRequest): TechnicalMessage[] {
  const invalid = () => { throw createError({ statusCode: 422, statusMessage: 'INVALID_HISTORY' }) }
  if (request.kind === 'message') {
    if (request.round !== 1 || request.technicalHistory.length !== 0) invalid()
    return [{ role: 'user', text: request.text }]
  }
  if (request.round < 2) invalid()
  const history = request.technicalHistory
  if (history[0]?.role !== 'user' || !('text' in history[0]) || !history[0].text.trim()) invalid()
  const ids = new Set<string>()
  const refs = new Set<string>()
  let pending: ToolCall | undefined
  let modelText = false
  for (const message of history.slice(1)) {
    if (message.role === 'user') invalid()
    if (message.role === 'model' && 'text' in message) {
      if (pending || modelText) invalid()
      modelText = true
    } else if (message.role === 'model' && 'call' in message) {
      if (pending || ids.has(message.call.actionId) || refs.has(message.call.ref) || ['request-review', 'request-delete', 'prepare-batch'].includes(message.call.name)) invalid()
      pending = message.call
      ids.add(message.call.actionId)
      refs.add(message.call.ref)
    } else if (message.role === 'tool') {
      if (!pending || message.result.actionId !== pending.actionId || message.result.ref !== pending.ref) invalid()
      pending = undefined
      modelText = false
    } else invalid()
  }
  if (!pending || ids.size !== request.round - 1 || request.ack.actionId !== pending.actionId || request.ack.ref !== pending.ref) invalid()
  return [...history, { role: 'tool', result: request.ack }]
}

export function toGenkitMessages(visible: ChatRequest['visibleHistory'], history: TechnicalMessage[]): MessageData[] {
  const messages: MessageData[] = visible.map(message => ({
    role: message.role === 'assistant' ? 'model' : 'user', content: [{ text: message.text }],
  }))
  let pending: ToolCall | undefined
  for (const message of history) {
    if ('text' in message) {
      messages.push({ role: message.role, content: [{ text: message.text }] })
    } else if ('call' in message) {
      pending = message.call
      const part = { toolRequest: { name: pending.name, ref: pending.ref, input: pending.input } }
      const last = messages.at(-1)
      if (last?.role === 'model') last.content.push(part)
      else messages.push({ role: 'model', content: [part] })
    } else {
      if (!pending) throw new Error('INVALID_HISTORY')
      messages.push({ role: 'tool', content: [{ toolResponse: { name: pending.name, ref: pending.ref, output: message.result } }] })
      pending = undefined
    }
  }
  return messages
}
