import { workspaceSchema } from '#shared/schemas'
import type { Workspace } from '#shared/types'

export const STORAGE_KEY = 'genkit-assistant:v1'

export function emptyWorkspace(): Workspace {
  return { schemaVersion: 1, clients: [], contracts: [], messages: [], draft: null }
}

export function readWorkspace(storage: Pick<Storage, 'getItem'>): Workspace {
  const raw = storage.getItem(STORAGE_KEY)
  return raw === null ? emptyWorkspace() : workspaceSchema.parse(JSON.parse(raw))
}

export function writeWorkspace(storage: Pick<Storage, 'setItem'>, workspace: Workspace): void {
  const document = workspaceSchema.parse(workspace)
  storage.setItem(STORAGE_KEY, JSON.stringify(document))
}
