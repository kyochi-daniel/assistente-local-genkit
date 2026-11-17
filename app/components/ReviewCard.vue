<template>
  <section v-if="review" id="review-card" ref="card" class="review-card" tabindex="-1" aria-labelledby="review-title">
    <header><span class="review-icon"><ClipboardCheck aria-hidden="true" /></span><div><h3 id="review-title">{{ review.recordId ? 'Confira as alterações' : 'Confira antes de salvar' }}</h3></div></header>
    <p>Confirme os dados locais. Editar qualquer campo exige nova revisão.</p>
    <dl v-if="review.entity === 'client'" class="review-fields"><div><dt>Nome</dt><dd>{{ review.snapshot.name }}</dd></div><div><dt>E-mail</dt><dd>{{ review.snapshot.email || 'Não informado' }}</dd></div><div><dt>Telefone</dt><dd>{{ review.snapshot.phone || 'Não informado' }}</dd></div></dl>
    <dl v-else class="review-fields"><div><dt>Cliente</dt><dd>{{ clientName }} <small>({{ review.snapshot.clientId.slice(0, 8) }})</small></dd></div><div><dt>Título</dt><dd>{{ review.snapshot.title }}</dd></div><div><dt>Valor</dt><dd>{{ currency(review.snapshot.valueCents) }}</dd></div><div><dt>Início</dt><dd>{{ date(review.snapshot.startDate) }}</dd></div><div><dt>Término</dt><dd>{{ review.snapshot.endDate ? date(review.snapshot.endDate) : 'Não informado' }}</dd></div><div><dt>Status</dt><dd>{{ statusNames[review.snapshot.status] }}</dd></div></dl>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div ref="actions" class="review-actions"><Button type="button" :disabled="busy || saving" @click="confirm"><Check aria-hidden="true" />{{ saving ? 'Salvando…' : review.recordId ? 'Confirmar alterações' : 'Confirmar salvamento' }}</Button><Button type="button" variant="ghost" :disabled="saving" @click="cancelReview">Cancelar</Button></div>
  </section>
</template>

<script setup lang="ts">
import { Check, ClipboardCheck } from '@lucide/vue'
import { Button } from '~/components/ui/button'

const { state, review, saving, error, confirmReview, cancelReview, addMessage } = useWorkspace()
const { busy } = useAssistant()
const card = ref<HTMLElement | null>(null)
const actions = ref<HTMLElement | null>(null)
const statusNames = { draft: 'Rascunho', active: 'Ativo', closed: 'Encerrado' }
const clientName = computed(() => {
  const pending = review.value
  return pending?.entity === 'contract' ? state.value.clients.find(client => client.id === pending.snapshot.clientId)?.name || 'Cliente não encontrado' : ''
})

const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100)
const date = (value: string) => value.split('-').reverse().join('/')
const confirm = async () => {
  const entity = review.value?.entity
  const isEditing = !!review.value?.recordId
  const record = await confirmReview()
  if (!record) return
  addMessage('assistant', `${entity === 'client' ? 'Cliente' : 'Contrato'} ${isEditing ? 'atualizado' : 'salvo'} com sucesso. O cadastro está disponível na lista.`)
  await navigateTo(entity === 'client' ? '/clientes' : '/contratos')
}

watch(review, async (value) => {
  if (!value) return
  await nextTick()
  card.value?.focus({ preventScroll: true })
  actions.value?.scrollIntoView({ block: 'nearest' })
})
</script>
