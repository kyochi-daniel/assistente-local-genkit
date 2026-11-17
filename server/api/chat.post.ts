import { createError, createEventStream, defineEventHandler, setHeader } from 'h3'
import { useRuntimeConfig } from '#imports'
import { chatRequestSchema } from '#shared/schemas'
import { assertOrigin, requireSession } from '../utils/auth'
import { readLimitedJSON } from '../utils/body'
import { normalizeHistory } from '../ai/history'
import { AssistantError, runAssistantRound } from '../ai/assistant'
import { resolveProviderConfig } from '../utils/model-catalog'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  assertOrigin(event, config)
  await requireSession(event, config)
  const result = chatRequestSchema.safeParse(await readLimitedJSON(event, 256 * 1024))
  if (!result.success) throw createError({ statusCode: 400, statusMessage: 'INVALID_REQUEST' })
  const request = result.data
  const initialRemaining = request.deadlineAt - Date.now()
  if (initialRemaining <= 0 || initialRemaining > 60_000) throw createError({ statusCode: 400, statusMessage: 'Prazo do turno inválido.' })
  const history = normalizeHistory(request)
  if (!config.openrouterApiKey || (!request.modelSelection && !config.openrouterModel)) {
    throw createError({ statusCode: 503, statusMessage: 'MODEL_UNAVAILABLE: configure a chave OpenRouter e o modelo no servidor.' })
  }
  const provider = await resolveProviderConfig(config, request.modelSelection, request.deadlineAt)
  const remaining = request.deadlineAt - Date.now()
  if (remaining <= 0) throw createError({ statusCode: 400, statusMessage: 'Prazo do turno inválido.' })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), remaining)
  const stream = createEventStream(event)
  setHeader(event, 'Cache-Control', 'no-cache, no-store')
  setHeader(event, 'X-Accel-Buffering', 'no')
  stream.onClosed(() => { clearTimeout(timeout); controller.abort() })
  void (async () => {
    try {
      await Promise.race([
        runAssistantRound(request, history, provider, controller.signal, async data => {
          controller.signal.throwIfAborted()
          await stream.push(JSON.stringify(data))
        }),
        new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new AssistantError('TIMEOUT', 'O turno atingiu o prazo ou foi interrompido.')), { once: true })),
      ])
    } catch (error) {
      const failure = error instanceof AssistantError ? error : new AssistantError(controller.signal.aborted ? 'TIMEOUT' : 'PROVIDER_ERROR', 'Não foi possível concluir a resposta. Tente novamente.')
      if (!event.node.res.destroyed) await stream.push(JSON.stringify({ turnId: request.turnId, type: 'error', code: failure.code, message: failure.message }))
    } finally {
      clearTimeout(timeout)
      await stream.close()
    }
  })().catch(() => { controller.abort(); clearTimeout(timeout) })
  return stream.send()
})
