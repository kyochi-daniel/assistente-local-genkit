import { z } from 'zod'
import { modelSelectionSchema } from './models'

export const entitySchema = z.enum(['client', 'contract'])
export const screenSchema = z.enum(['assistant', 'clients', 'client-new', 'client-edit', 'contracts', 'contract-new', 'contract-edit', 'trash', 'settings'])
const uuid = z.uuid()
const revision = z.number().int().nonnegative()
const date = z.iso.date()
const optionalDate = z.union([date, z.literal('')])
const email = z.union([z.email().max(254), z.literal('')])

export const clientFieldsSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome.').max(120),
  email: email.default(''),
  phone: z.string().max(30).default(''),
}).strict()
const contractBase = z.object({
  clientId: uuid,
  title: z.string().trim().min(1, 'Informe o título.').max(160),
  valueCents: z.number().int().min(1, 'Informe um valor positivo.').max(99999999999),
  startDate: date,
  endDate: optionalDate.default(''),
  status: z.enum(['draft', 'active', 'closed']).default('draft'),
}).strict()
const datesOrdered = (v: { startDate: string; endDate?: string }) => !v.endDate || v.endDate >= v.startDate
export const contractFieldsSchema = contractBase.refine(datesOrdered, {
  path: ['endDate'], message: 'O término deve ser igual ou posterior ao início.',
})
export const clientPatchSchema = clientFieldsSchema.partial().extend({ email: email.optional(), phone: z.string().max(30).optional() })
export const contractPatchSchema = contractBase.partial().extend({ endDate: optionalDate.optional(), status: z.enum(['draft', 'active', 'closed']).optional() })

// Drafts retain incomplete manual input; only review requires a complete valid record.
const clientDraftFields = z.object({ name: z.string().max(120), email: z.string().max(254), phone: z.string().max(30) }).strict().partial()
const contractDraftFields = z.object({
  clientId: z.string().max(36), title: z.string().max(160), valueCents: z.number().finite(),
  startDate: z.string().max(10), endDate: z.string().max(10), status: z.enum(['draft', 'active', 'closed']),
}).strict().partial()
export const draftSchema = z.discriminatedUnion('entity', [
  z.object({ draftId: uuid, revision, recordId: uuid.optional(), recordRevision: revision.optional(), entity: z.literal('client'), fields: clientDraftFields }).strict(),
  z.object({ draftId: uuid, revision, recordId: uuid.optional(), recordRevision: revision.optional(), entity: z.literal('contract'), fields: contractDraftFields }).strict(),
])
const batchRef = z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/).refine(value => !['__proto__', 'prototype', 'constructor'].includes(value), 'Referência reservada.')
const batchClientSchema = clientDraftFields.extend({ ref: batchRef })
const batchContractSchema = contractDraftFields.omit({ clientId: true }).extend({ ref: batchRef, clientRef: z.string().min(1).max(40).optional() })
const batchFields = { clients: z.array(batchClientSchema).max(10), contracts: z.array(batchContractSchema).max(10) }
function validateBatchSize(value: { clients: { ref: string }[]; contracts: { ref: string }[] }, ctx: z.RefinementCtx) {
  const items = [...value.clients, ...value.contracts]
  if (!items.length || items.length > 10) ctx.addIssue({ code: 'custom', message: 'Prepare de 1 a 10 cadastros por lote.' })
  if (new Set(items.map(item => item.ref)).size !== items.length) ctx.addIssue({ code: 'custom', message: 'Cada cadastro do lote precisa de uma referência única.' })
}
export const batchDraftSchema = z.object({ batchId: uuid, revision, ...batchFields }).strict().superRefine(validateBatchSize)
export const prepareBatchInputSchema = z.object({ batchId: uuid.optional(), expectedRevision: revision.optional(), ...batchFields }).strict().superRefine((value, ctx) => {
  validateBatchSize(value, ctx)
  if (!!value.batchId !== (value.expectedRevision !== undefined)) ctx.addIssue({ code: 'custom', message: 'Para alterar um lote, informe seu ID e revisão atuais.' })
})
const recordMetadata = { id: uuid, createdAt: z.iso.datetime(), revision: revision.optional(), updatedAt: z.iso.datetime().optional(), deletedAt: z.iso.datetime().optional(), deletionBatchId: uuid.optional() }
export const clientSchema = clientFieldsSchema.extend(recordMetadata)
export const contractSchema = contractBase.extend(recordMetadata).refine(datesOrdered, {
  path: ['endDate'], message: 'O término deve ser igual ou posterior ao início.',
})
export const messageSchema = z.object({
  id: uuid, role: z.enum(['user', 'assistant']), text: z.string().max(4000), createdAt: z.iso.datetime(),
}).strict()
export const workspaceSchema = z.object({
  schemaVersion: z.literal(1), clients: z.array(clientSchema).max(200), contracts: z.array(contractSchema).max(200),
  messages: z.array(messageSchema).max(40), draft: draftSchema.nullable(),
  batchDraft: batchDraftSchema.nullable().optional(),
}).strict().superRefine((value, ctx) => {
  const ids = new Set(value.clients.map(c => c.id))
  if (ids.size !== value.clients.length || new Set(value.contracts.map(c => c.id)).size !== value.contracts.length)
    ctx.addIssue({ code: 'custom', message: 'Identificadores locais duplicados.' })
  if (value.contracts.some(c => !ids.has(c.clientId)))
    ctx.addIssue({ code: 'custom', message: 'Contrato sem cliente existente.' })
})

export const navigateInputSchema = z.object({ screen: screenSchema, recordId: uuid.optional() }).strict().superRefine((value, ctx) => {
  const editing = value.screen === 'client-edit' || value.screen === 'contract-edit'
  if (editing !== !!value.recordId) ctx.addIssue({ code: 'custom', path: ['recordId'], message: editing ? 'Informe o registro a editar.' : 'Esta tela não aceita identificador de registro.' })
})
export const patchDraftInputSchema = z.discriminatedUnion('entity', [
  z.object({ entity: z.literal('client'), draftId: uuid, expectedRevision: revision, fields: clientPatchSchema }).strict(),
  z.object({ entity: z.literal('contract'), draftId: uuid, expectedRevision: revision, fields: contractPatchSchema }).strict(),
])
export const requestReviewInputSchema = z.object({ entity: entitySchema, draftId: uuid, expectedRevision: revision }).strict()
export const requestDeleteInputSchema = z.object({ entity: entitySchema, recordId: uuid, expectedRevision: revision }).strict()
export const actionSchema = z.discriminatedUnion('name', [
  z.object({ name: z.literal('navigate'), input: navigateInputSchema }).strict(),
  z.object({ name: z.literal('patch-draft'), input: patchDraftInputSchema }).strict(),
  z.object({ name: z.literal('request-review'), input: requestReviewInputSchema }).strict(),
  z.object({ name: z.literal('request-delete'), input: requestDeleteInputSchema }).strict(),
  z.object({ name: z.literal('prepare-batch'), input: prepareBatchInputSchema }).strict(),
])
const callId = { actionId: uuid, ref: z.string().min(1).max(200) }
export const toolCallSchema = z.discriminatedUnion('name', [
  z.object({ ...callId, name: z.literal('navigate'), input: navigateInputSchema }).strict(),
  z.object({ ...callId, name: z.literal('patch-draft'), input: patchDraftInputSchema }).strict(),
  z.object({ ...callId, name: z.literal('request-review'), input: requestReviewInputSchema }).strict(),
  z.object({ ...callId, name: z.literal('request-delete'), input: requestDeleteInputSchema }).strict(),
  z.object({ ...callId, name: z.literal('prepare-batch'), input: prepareBatchInputSchema }).strict(),
])
export const ackSchema = z.object({
  actionId: uuid, ref: callId.ref, status: z.enum(['success', 'rejected', 'error']), screen: screenSchema,
  draft: draftSchema.nullable(), code: z.enum(['INVALID_ACTION', 'STALE_DRAFT', 'USER_REJECTED', 'NAVIGATION_FAILED']).optional(),
}).strict()
export const technicalMessageSchema = z.union([
  z.object({ role: z.enum(['user', 'model']), text: z.string().max(4000) }).strict(),
  z.object({ role: z.literal('model'), call: toolCallSchema }).strict(),
  z.object({ role: z.literal('tool'), result: ackSchema }).strict(),
])
const requestBase = z.object({
  modelSelection: modelSelectionSchema.optional(),
  turnId: uuid, round: z.number().int().min(1).max(6), deadlineAt: z.number().int().positive(),
  visibleHistory: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) }).strict()).max(40),
  technicalHistory: z.array(technicalMessageSchema).max(24),
  context: z.object({
    screen: screenSchema, draft: draftSchema.nullable(),
    clients: z.array(z.object({ id: uuid, name: z.string().max(120), revision: revision.optional() }).strict()).max(200),
    contracts: z.array(z.object({ id: uuid, title: z.string().max(160), clientId: uuid, revision: revision.optional() }).strict()).max(200).optional(),
    batchDraft: batchDraftSchema.nullable().optional(),
  }).strict(),
})
export const chatRequestSchema = z.discriminatedUnion('kind', [
  requestBase.extend({ kind: z.literal('message'), text: z.string().trim().min(1).max(4000) }).strict(),
  requestBase.extend({ kind: z.literal('continue'), ack: ackSchema }).strict(),
])
export const streamEventSchema = z.discriminatedUnion('type', [
  z.object({ turnId: uuid, type: z.literal('text_delta'), text: z.string().max(4000) }).strict(),
  z.object({ turnId: uuid, type: z.literal('action_requested'), call: toolCallSchema }).strict(),
  z.object({ turnId: uuid, type: z.literal('turn_end'), reason: z.enum(['complete', 'awaiting_ack', 'awaiting_user', 'step_limit']), technicalHistory: z.array(technicalMessageSchema).max(24) }).strict(),
  z.object({ turnId: uuid, type: z.literal('error'), code: z.string().max(80), message: z.string().max(500) }).strict(),
  z.object({ turnId: uuid, type: z.literal('model_selected'), model: z.string().max(200), fallback: z.boolean() }).strict(),
])
