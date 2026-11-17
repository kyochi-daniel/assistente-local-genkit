import { draftSchema } from '#shared/schemas'
import type { Draft, Screen } from '#shared/types'

export const SCREEN_PATHS: Record<Screen, string> = {
  assistant: '/assistente', clients: '/clientes', 'client-new': '/clientes/novo',
  contracts: '/contratos', 'contract-new': '/contratos/novo',
  'client-edit': '/clientes/:id/editar', 'contract-edit': '/contratos/:id/editar', trash: '/lixeira', settings: '/configuracoes',
}

export function screenFromPath(path: string): Screen {
  if (/^\/clientes\/[0-9a-f-]{36}\/editar$/i.test(path)) return 'client-edit'
  if (/^\/contratos\/[0-9a-f-]{36}\/editar$/i.test(path)) return 'contract-edit'
  return (Object.entries(SCREEN_PATHS).find(([, value]) => value === path)?.[0] as Screen) ?? 'assistant'
}

export function pathForScreen(screen: Screen, recordId?: string): string {
  return SCREEN_PATHS[screen].replace(':id', recordId ?? '')
}

export function patchDraft(draft: Draft, fields: unknown): Draft {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('INVALID_FIELDS')
  const next = draftSchema.parse({ ...draft, fields: { ...draft.fields, ...fields } })
  const changed = Object.entries(next.fields).some(([key, value]) => Reflect.get(draft.fields, key) !== value)
  if (!changed) return draft
  return { ...next, revision: draft.revision + 1 }
}

export function matchesDraft(draft: Draft | null, input: { draftId: string; entity: string; expectedRevision: number }): boolean {
  return draft !== null && draft.draftId === input.draftId && draft.entity === input.entity && draft.revision === input.expectedRevision
}
