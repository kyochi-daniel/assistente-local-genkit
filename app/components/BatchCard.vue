<template>
  <section v-if="preview" id="batch-card" ref="card" class="review-card batch-card" tabindex="-1" aria-labelledby="batch-title">
    <header><span class="review-icon"><ClipboardCheck aria-hidden="true" /></span><div><h3 id="batch-title">Revisar lote</h3><p>{{ counts }}</p></div></header>
    <p>Todos os cadastros abaixo serão criados juntos neste navegador após sua confirmação.</p>
    <div class="batch-items">
      <article v-for="(client, index) in preview.clients" :key="client.ref" class="batch-item"><h4>Cliente {{ index + 1 }} · {{ client.name || 'Nome não informado' }}</h4><dl class="review-fields"><div><dt>Nome</dt><dd>{{ client.name || 'Não informado' }}</dd></div><div><dt>E-mail</dt><dd>{{ client.email || 'Não informado' }}</dd></div><div><dt>Telefone</dt><dd>{{ client.phone || 'Não informado' }}</dd></div></dl></article>
      <article v-for="(contract, index) in preview.contracts" :key="contract.ref" class="batch-item"><h4>Contrato {{ index + 1 }} · {{ contract.title || 'Título não informado' }}</h4><dl class="review-fields"><div><dt>Cliente</dt><dd>{{ clientLabel(contract.clientRef) }}</dd></div><div><dt>Título</dt><dd>{{ contract.title || 'Não informado' }}</dd></div><div><dt>Valor</dt><dd>{{ contract.valueCents === undefined ? 'Não informado' : currency(contract.valueCents) }}</dd></div><div><dt>Início</dt><dd>{{ contract.startDate ? date(contract.startDate) : 'Não informado' }}</dd></div><div><dt>Término</dt><dd>{{ contract.endDate ? date(contract.endDate) : 'Não informado' }}</dd></div><div><dt>Status</dt><dd>{{ statusNames[contract.status || 'draft'] }}</dd></div></dl></article>
    </div>
    <div v-if="batchIssues.length" class="batch-issues" role="status"><h4>Faltam informações</h4><ul><li v-for="(issue, index) in batchIssues" :key="index">{{ issue }}</li></ul><p>Informe os dados que faltam no chat para completar o lote.</p></div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div ref="actions" class="review-actions"><Button v-if="!batchIssues.length" type="button" :disabled="busy || saving || !hydrated || !batchReview" @click="confirm"><Check aria-hidden="true" />{{ saving ? 'Salvando…' : 'Confirmar cadastros' }}</Button><Button v-if="batchReview" type="button" variant="ghost" :disabled="busy || saving || !hydrated" @click="cancelBatchReview">Cancelar revisão</Button><Button v-else-if="!batchIssues.length" type="button" variant="outline" :disabled="busy || saving || !hydrated" @click="requestBatchReview">Revisar lote</Button><Button type="button" variant="ghost" :disabled="busy || saving || !hydrated" @click="discard">Descartar lote</Button></div>
  </section>
</template>

<script setup lang="ts">
import { Check, ClipboardCheck } from '@lucide/vue'
import { Button } from '~/components/ui/button'

const { activeClients, batchDraft, batchIssues, batchReview, hydrated, saving, error, confirmBatch, cancelBatchReview, discardBatch, requestBatchReview, addMessage } = useWorkspace()
const { busy } = useAssistant()
const card = ref<HTMLElement | null>(null)
const actions = ref<HTMLElement | null>(null)
const statusNames = { draft: 'Rascunho', active: 'Ativo', closed: 'Encerrado' }
const preview = computed(() => batchReview.value?.snapshot ?? batchDraft.value)
const counts = computed(() => {
  const clients = preview.value?.clients.length ?? 0
  const contracts = preview.value?.contracts.length ?? 0
  return `${clients} ${clients === 1 ? 'cliente' : 'clientes'} · ${contracts} ${contracts === 1 ? 'contrato' : 'contratos'}`
})

const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100)
const date = (value: string) => value.split('-').reverse().join('/')
const clientLabel = (reference?: string) => {
  if (!reference) return 'Não informado'
  const index = preview.value?.clients.findIndex(client => client.ref === reference) ?? -1
  const client = index >= 0 ? preview.value?.clients[index] : undefined
  if (client) return `${client.name || 'Nome não informado'} (cliente ${index + 1} do lote)`
  const existing = activeClients.value.find(client => client.id === reference)
  return existing ? `${existing.name} · ${existing.email || existing.phone || existing.id.slice(0, 8)} · ${existing.id.slice(0, 8)}` : 'Cliente não encontrado'
}

const confirm = async () => {
  const result = await confirmBatch()
  if (!result) return
  const clients = result.clients.length
  const contracts = result.contracts.length
  addMessage('assistant', `Lote salvo com sucesso: ${clients} ${clients === 1 ? 'cliente' : 'clientes'} e ${contracts} ${contracts === 1 ? 'contrato' : 'contratos'} criados. Os cadastros estão disponíveis nas listas.`)
  await navigateTo(clients ? '/clientes' : '/contratos')
}

const discard = () => {
  if (window.confirm('Descartar este lote e todos os dados ainda não salvos?')) discardBatch()
}

watch([batchDraft, batchReview], async ([draft, review]) => {
  if (!draft && !review) return
  await nextTick()
  card.value?.focus({ preventScroll: true })
  if (review) actions.value?.scrollIntoView({ block: 'nearest' })
  else card.value?.scrollIntoView({ block: 'nearest' })
}, { immediate: true })
</script>
