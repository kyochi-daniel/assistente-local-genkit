import { z } from 'zod'

export const modelIdSchema = z.string().trim().max(200).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*(?::[a-zA-Z0-9][a-zA-Z0-9._-]*)?$/, 'Informe o ID no formato provedor/modelo[:tag].')
export const modelSelectionSchema = z.object({ primary: modelIdSchema, fallback: modelIdSchema.nullable() }).strict()
export type ModelSelection = z.infer<typeof modelSelectionSchema>
export type CatalogModel = {
  id: string
  name: string
  description: string
  cost: 'free' | 'paid' | 'unknown'
  promptPrice: string | null
  completionPrice: string | null
  contextLength: number
  inputModalities: string[]
  outputModalities: string[]
  hasAdditionalCosts: boolean
  compatible: boolean
}
export type ExchangeRate = {
  rate: number
  quotedAt: string
  fetchedAt: string
  source: 'AwesomeAPI'
  stale: boolean
}
export type ModelCatalogResponse = {
  items: CatalogModel[]
  total: number
  page: number
  pageSize: number
  updatedAt: string
  stale: boolean
  defaults: ModelSelection
}
