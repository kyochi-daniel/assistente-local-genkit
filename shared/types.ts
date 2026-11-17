import type { z } from 'zod'
import type { ackSchema, actionSchema, batchDraftSchema, prepareBatchInputSchema, chatRequestSchema, clientFieldsSchema, clientSchema, contractFieldsSchema, contractSchema, draftSchema, entitySchema, screenSchema, streamEventSchema, technicalMessageSchema, toolCallSchema, workspaceSchema } from './schemas'

export type Entity = z.infer<typeof entitySchema>
export type Screen = z.infer<typeof screenSchema>
export type ClientFields = z.infer<typeof clientFieldsSchema>
export type ContractFields = z.infer<typeof contractFieldsSchema>
export type Client = z.infer<typeof clientSchema>
export type Contract = z.infer<typeof contractSchema>
export type Draft = z.infer<typeof draftSchema>
export type Workspace = z.infer<typeof workspaceSchema>
export type Review = { draftId: string; revision: number; recordId?: string; recordRevision?: number } & (
  | { entity: 'client'; snapshot: ClientFields }
  | { entity: 'contract'; snapshot: ContractFields }
)
export type MutationReview = {
  action: 'delete' | 'restore'
  entity: Entity
  recordId: string
  recordRevision: number
  label: string
  batchId: string
  affected: { entity: Entity; id: string; revision: number; label: string }[]
}
export type BatchDraft = z.infer<typeof batchDraftSchema>
export type BatchClient = BatchDraft['clients'][number]
export type BatchContract = BatchDraft['contracts'][number]
export type PrepareBatchInput = z.infer<typeof prepareBatchInputSchema>
export type BatchReview = { batchId: string; revision: number; snapshot: BatchDraft; ids: Record<string, string> }
export type Action = z.infer<typeof actionSchema>
export type ToolCall = z.infer<typeof toolCallSchema>
export type Ack = z.infer<typeof ackSchema>
export type TechnicalMessage = z.infer<typeof technicalMessageSchema>
export type ChatRequest = z.infer<typeof chatRequestSchema>
export type AssistantEvent = z.infer<typeof streamEventSchema>
export type ChatEvent = AssistantEvent
