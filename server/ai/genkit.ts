import { genkit, modelRef, type MessageData } from 'genkit'
import { openAICompatible } from '@genkit-ai/compat-oai'
import { z } from 'zod'
import { navigateInputSchema, patchDraftInputSchema, requestReviewInputSchema, requestDeleteInputSchema, prepareBatchInputSchema } from '#shared/schemas'

let cached: { apiKey: string; ai: ReturnType<typeof createAI> } | undefined

function createAI(apiKey: string) {
  const ai = genkit({
    plugins: [openAICompatible({ name: 'openrouter', apiKey, baseURL: 'https://openrouter.ai/api/v1', maxRetries: 0, timeout: 60_000, fetch: globalThis.fetch })],
  })
  const definitions = [
    { name: 'navigate', description: 'Abre uma tela permitida. Aguarde o resultado antes de preencher o formulário.', schema: navigateInputSchema },
    { name: 'patch-draft', description: 'Atualiza somente campos permitidos do formulário atual, usando o ID e revisão atuais. Nunca salva.', schema: patchDraftInputSchema },
    { name: 'request-review', description: 'Solicita revisão do cadastro atual e encerra o turno. A pessoa precisa confirmar o salvamento no cartão.', schema: requestReviewInputSchema },
    { name: 'request-delete', description: 'Solicita um cartão de confirmação para arquivar um registro ativo e encerra o turno. Não exclui dados; o cartão mostra o impacto nos contratos vinculados e exige clique humano.', schema: requestDeleteInputSchema },
    { name: 'prepare-batch', description: 'Prepara até 10 clientes/contratos com uma confirmação; não salva. Extraia os dados da mensagem humana atual nos campos planos dos itens, sem fields. Novo: clients:[{ref:"c1",name:"Ana"}], contracts:[{ref:"k1",clientRef:"c1",title:"Serviço"}]. Atualizar valor/data: batchId e expectedRevision atuais, clients:[], contracts:[{ref:"k1",valueCents:250000,startDate:"2026-11-15"}]. Use refs atuais; dados omitidos e grupos [] são preservados. Não envie só ref/clientRef quando a pessoa informou valor/data. Encerra o turno.', schema: prepareBatchInputSchema },
  ]
  const tools = definitions.map(({ name, description, schema }) => ai.defineTool({
    name, description, inputJsonSchema: z.toJSONSchema(schema, { target: 'draft-7' }) as Parameters<typeof ai.defineTool>[0]['inputJsonSchema'],
  }, async () => { throw new Error('Ferramentas somente podem ser executadas pelo navegador.') }))
  return { ai, tools }
}

export function generateWithGenkit(apiKey: string, model: string, system: string, messages: MessageData[], abortSignal: AbortSignal) {
  if (!cached || cached.apiKey !== apiKey) cached = { apiKey, ai: createAI(apiKey) }
  const { ai, tools } = cached.ai
  return ai.generateStream({
    model: modelRef({ name: `openrouter/${model}`, info: { supports: { tools: true, multiturn: true, systemRole: true } } }),
    system, messages, tools, returnToolRequests: true, abortSignal,
    // compat-oai genérico ignora maxOutputTokens; OpenRouter recebe também o campo nativo.
    config: { maxOutputTokens: 2000, max_tokens: 2000 },
  })
}
