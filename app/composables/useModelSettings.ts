import { useState } from '#imports'
import { modelSelectionSchema, type ModelSelection } from '#shared/models'

export const MODEL_SETTINGS_KEY = 'nexo:model-settings:v1'

export function useModelSettings() {
  const selection = useState<ModelSelection | null>('model-settings-selection', () => null)
  const initialized = useState('model-settings-initialized', () => false)
  const blocked = useState('model-settings-blocked', () => false)
  const error = useState('model-settings-error', () => '')
  const assistantBusy = useState('assistant-busy', () => false)

  function init(): void {
    if (!process.client || initialized.value) return
    try {
      const raw = localStorage.getItem(MODEL_SETTINGS_KEY)
      if (raw !== null) selection.value = modelSelectionSchema.parse(JSON.parse(raw))
    } catch {
      blocked.value = true
      error.value = 'Não foi possível ler a configuração local. A seleção anterior foi preservada. Use o padrão do ambiente para redefinir somente esta configuração.'
    }
    initialized.value = true
  }

  function apply(input: unknown): boolean {
    init()
    if (!process.client || !initialized.value || assistantBusy.value) return false
    if (blocked.value) return false
    try {
      const next = modelSelectionSchema.parse(input)
      localStorage.setItem(MODEL_SETTINGS_KEY, JSON.stringify(next))
      selection.value = next
      error.value = ''
      return true
    } catch {
      error.value = 'Não foi possível aplicar a configuração. Confira os IDs e o armazenamento do navegador. A seleção anterior foi preservada.'
      return false
    }
  }

  function reset(): boolean {
    init()
    if (!process.client || !initialized.value || assistantBusy.value) return false
    try {
      localStorage.removeItem(MODEL_SETTINGS_KEY)
      selection.value = null
      blocked.value = false
      error.value = ''
      return true
    } catch {
      error.value = 'Não foi possível restaurar o padrão do ambiente. A seleção anterior foi preservada.'
      return false
    }
  }

  return { selection, initialized, error, init, apply, reset }
}
