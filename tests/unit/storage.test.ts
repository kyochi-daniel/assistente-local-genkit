import { describe, expect, it, vi } from 'vitest'
import { emptyWorkspace, readWorkspace, STORAGE_KEY, writeWorkspace } from '../../app/utils/storage'

describe('armazenamento local', () => {
  it('inicia apenas quando a chave não existe e valida o envelope', () => {
    expect(readWorkspace({ getItem: () => null })).toEqual(emptyWorkspace())
    expect(() => readWorkspace({ getItem: () => '{"schemaVersion":2}' })).toThrow()
    expect(() => readWorkspace({ getItem: () => '{' })).toThrow()
  })

  it('não tenta gravar documentos inválidos', () => {
    const setItem = vi.fn()
    expect(() => writeWorkspace({ setItem }, { ...emptyWorkspace(), schemaVersion: 2 } as never)).toThrow()
    expect(setItem).not.toHaveBeenCalled()
  })

  it('propaga falha de escrita e preserva o documento recebido', () => {
    const workspace = emptyWorkspace()
    expect(() => writeWorkspace({ setItem: () => { throw new Error('quota') } }, workspace)).toThrow('quota')
    expect(workspace).toEqual(emptyWorkspace())
    const setItem = vi.fn()
    writeWorkspace({ setItem }, workspace)
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(workspace))
  })
})

it('lê versão 1 anterior e preserva metadados da lixeira no roundtrip', () => {
  const old = { ...emptyWorkspace(), clients: [{ id: '00000000-0000-4000-8000-000000000001', name: 'Ana', email: '', phone: '', createdAt: '2026-11-13T12:00:00.000Z' }] }
  expect(readWorkspace({ getItem: () => JSON.stringify(old) }).clients[0]?.name).toBe('Ana')
  const archived = { ...old, clients: old.clients.map(client => ({ ...client, revision: 1, deletedAt: client.createdAt, deletionBatchId: client.id })) }
  let raw = ''
  writeWorkspace({ setItem: (_key, value) => { raw = value } }, archived)
  expect(readWorkspace({ getItem: () => raw })).toEqual(archived)
})
