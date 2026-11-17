import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MODEL_SETTINGS_KEY, useModelSettings } from '../../app/composables/useModelSettings'

const states = vi.hoisted(() => new Map<string, { value: unknown }>())
vi.mock('#imports', () => ({
  useState: (key: string, init: () => unknown) => {
    if (!states.has(key)) states.set(key, { value: init() })
    return states.get(key)
  },
}))

const originalClient = Object.getOwnPropertyDescriptor(process, 'client')
const oldSelection = { primary: 'vendor/old:free', fallback: null }
const nextSelection = { primary: 'vendor/new', fallback: 'vendor/backup:free' }
let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn> }

beforeEach(() => {
  states.clear()
  Object.defineProperty(process, 'client', { configurable: true, value: true })
  storage = { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() }
  vi.stubGlobal('localStorage', storage)
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (originalClient) Object.defineProperty(process, 'client', originalClient)
  else Reflect.deleteProperty(process, 'client')
})

describe('preferência local de modelos', () => {
  it('sem escolha não persiste defaults e valida somente IDs com fallback explícito', () => {
    const settings = useModelSettings()
    settings.init()
    expect(settings.selection.value).toBeNull()
    expect(storage.getItem).toHaveBeenCalledWith(MODEL_SETTINGS_KEY)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(settings.apply({ primary: 'Nome livre', fallback: null })).toBe(false)
    expect(settings.apply({ primary: 'vendor/model', fallback: null, apiKey: 'not-a-key' })).toBe(false)
    expect(settings.apply({ primary: 'vendor/model' })).toBe(false)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('lê e grava seleção estrita mantendo fallback desativado como null', () => {
    storage.getItem.mockReturnValue(JSON.stringify(oldSelection))
    const settings = useModelSettings()
    settings.init()
    expect(settings.selection.value).toEqual(oldSelection)
    expect(settings.apply({ primary: 'vendor/new:free', fallback: null })).toBe(true)
    expect(storage.setItem).toHaveBeenCalledWith(MODEL_SETTINGS_KEY, JSON.stringify({ primary: 'vendor/new:free', fallback: null }))
    expect(settings.selection.value?.fallback).toBeNull()
  })

  it('falha de escrita ou remoção preserva a seleção e a edição recebida', () => {
    storage.getItem.mockReturnValue(JSON.stringify(oldSelection))
    const settings = useModelSettings()
    settings.init()
    storage.setItem.mockImplementation(() => { throw new Error('quota') })
    const candidate = { ...nextSelection }
    expect(settings.apply(candidate)).toBe(false)
    expect(settings.selection.value).toEqual(oldSelection)
    expect(candidate).toEqual(nextSelection)
    storage.removeItem.mockImplementation(() => { throw new Error('blocked') })
    expect(settings.reset()).toBe(false)
    expect(settings.selection.value).toEqual(oldSelection)
    expect(settings.error.value).toContain('preservada')
  })

  it('preserva dados ilegíveis até a redefinição explícita apenas da própria chave', () => {
    storage.getItem.mockReturnValue('{')
    const settings = useModelSettings()
    settings.selection.value = { ...oldSelection }
    settings.init()
    expect(settings.selection.value).toEqual(oldSelection)
    expect(settings.apply(nextSelection)).toBe(false)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(storage.removeItem).not.toHaveBeenCalled()
    expect(settings.reset()).toBe(true)
    expect(storage.removeItem).toHaveBeenCalledExactlyOnceWith(MODEL_SETTINGS_KEY)
    expect(settings.selection.value).toBeNull()
    expect(settings.apply(nextSelection)).toBe(true)
  })

  it('bloqueia aplicar e redefinir durante um turno', () => {
    const settings = useModelSettings()
    settings.init()
    states.get('assistant-busy')!.value = true
    expect(settings.apply(nextSelection)).toBe(false)
    expect(settings.reset()).toBe(false)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(storage.removeItem).not.toHaveBeenCalled()
  })
})
