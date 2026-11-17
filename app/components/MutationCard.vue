<template>
  <section v-if="mutationReview" id="mutation-card" ref="card" class="review-card" tabindex="-1" aria-labelledby="mutation-title">
    <header><span class="review-icon"><Trash2 v-if="mutationReview.action === 'delete'" aria-hidden="true" /><RotateCcw v-else aria-hidden="true" /></span><div><h3 id="mutation-title">{{ mutationReview.action === 'delete' ? 'Mover para a lixeira?' : 'Restaurar cadastro?' }}</h3></div></header>
    <dl class="review-fields"><div><dt>{{ mutationReview.entity === 'client' ? 'Cliente' : 'Contrato' }}</dt><dd>{{ mutationReview.label }} <small>({{ mutationReview.recordId.slice(0, 8) }})</small></dd></div></dl>
    <p>{{ impact }}</p>
    <ul v-if="mutationReview.affected.length" class="mutation-records" aria-label="Contratos incluídos nesta ação"><li v-for="record in mutationReview.affected" :key="record.id">{{ record.label }} <small>({{ record.id.slice(0, 8) }})</small></li></ul>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div ref="actions" class="review-actions"><Button type="button" :disabled="busy || saving" @click="confirm">{{ saving ? 'Salvando…' : mutationReview.action === 'delete' ? 'Mover para a lixeira' : 'Confirmar restauração' }}</Button><Button type="button" variant="ghost" :disabled="busy || saving" @click="clearReview">Cancelar</Button></div>
  </section>
</template>

<script setup lang="ts">
import { RotateCcw, Trash2 } from '@lucide/vue'
import { Button } from '~/components/ui/button'

const { mutationReview, saving, error, confirmMutation, clearReview, addMessage } = useWorkspace()
const { busy } = useAssistant()
const card = ref<HTMLElement | null>(null)
const actions = ref<HTMLElement | null>(null)

const impact = computed(() => {
  const pending = mutationReview.value
  if (!pending) return ''
  const contracts = `${pending.affected.length} ${pending.affected.length === 1 ? 'contrato' : 'contratos'}`
  const linked = pending.affected.length === 1 ? 'vinculado' : 'vinculados'
  const moved = pending.affected.length === 1 ? 'movido' : 'movidos'
  if (pending.action === 'delete') {
    return pending.entity === 'client'
      ? `O cliente e ${contracts} ${linked} sairão das listas ativas. Os dados ficam neste navegador. Restaure pela Lixeira; o cliente recupera somente os contratos movidos junto com ele.`
      : 'O contrato sairá da lista ativa; o cliente continuará disponível. Os dados ficam neste navegador e podem ser restaurados pela Lixeira.'
  }
  return pending.entity === 'client'
    ? `O cliente e ${contracts} ${moved} junto com ele voltarão às listas ativas. Contratos excluídos separadamente permanecem na lixeira. A restauração é local e pode ser desfeita movendo para a lixeira novamente.`
    : 'O contrato voltará à lista ativa com os mesmos dados e cliente. A restauração é local e pode ser desfeita movendo para a lixeira novamente.'
})

const confirm = async () => {
  const pending = mutationReview.value
  if (!pending || !await confirmMutation()) return
  const noun = pending.entity === 'client' ? 'Cliente' : 'Contrato'
  const affected = pending.affected.length
  const cascade = affected ? ` ${affected} ${affected === 1 ? 'contrato vinculado também foi' : 'contratos vinculados também foram'} ${pending.action === 'delete' ? 'para a lixeira' : affected === 1 ? 'restaurado' : 'restaurados'}.` : ''
  addMessage('assistant', `${noun} “${pending.label}” ${pending.action === 'delete' ? 'movido para a lixeira. Você pode restaurá-lo na Lixeira.' : 'restaurado com sucesso.'}${cascade}`)
  await navigateTo(pending.entity === 'client' ? '/clientes' : '/contratos')
}

watch(mutationReview, async (value) => {
  if (!value) return
  await nextTick()
  card.value?.focus({ preventScroll: true })
  actions.value?.scrollIntoView({ block: 'nearest' })
})
</script>
