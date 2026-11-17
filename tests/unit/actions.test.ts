import { describe, expect, it } from 'vitest'
import { matchesDraft, patchDraft, screenFromPath, pathForScreen } from '../../app/utils/actions'
import { toolCallSchema } from '../../shared/schemas'
import type { Draft } from '../../shared/types'

const draft: Draft = { entity: 'client', draftId: '00000000-0000-4000-8000-000000000001', revision: 0, fields: { name: 'Ana' } }

describe('ações do rascunho', () => {
  it('incrementa revisão uma vez e ignora valores idênticos sem mutar', () => {
    expect(patchDraft(draft, { name: 'Ana' })).toBe(draft)
    const next = patchDraft(draft, { email: 'em edição', phone: '11' })
    expect(next.revision).toBe(1)
    expect(draft.fields).toEqual({ name: 'Ana' })
    expect(matchesDraft(next, { entity: 'client', draftId: draft.draftId, expectedRevision: 0 })).toBe(false)
  })

  it('rejeita campos externos e tool save, mas preserva entrada manual incompleta', () => {
    expect(() => patchDraft(draft, { id: 'externo' })).toThrow()
    expect(patchDraft(draft, { name: ' ' }).fields).toEqual({ name: ' ' })
    expect(toolCallSchema.safeParse({ actionId: draft.draftId, ref: 'x', name: 'save', input: {} }).success).toBe(false)
    expect(toolCallSchema.safeParse({ actionId: draft.draftId, ref: 'x', name: 'patch-draft', input: { draftId: draft.draftId, entity: 'client', expectedRevision: 0, fields: { email: 'em edição' } } }).success).toBe(false)
    expect(screenFromPath('https://example.org')).toBe('assistant')
  })
})

it('resolve rotas de edição e lixeira sem aceitar URLs externas', () => {
  const path = pathForScreen('client-edit', draft.draftId)
  expect(path).toBe(`/clientes/${draft.draftId}/editar`)
  expect(screenFromPath(path)).toBe('client-edit')
  expect(screenFromPath(`/contratos/${draft.draftId}/editar`)).toBe('contract-edit')
  expect(screenFromPath('/lixeira')).toBe('trash')
})
