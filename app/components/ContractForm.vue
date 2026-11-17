<template>
  <form class="record-form" novalidate @submit.prevent="reviewContract">
    <header class="form-header"><span class="form-icon"><FilePlus2 aria-hidden="true" /></span><div><h2>Dados do contrato</h2><p>Vincule um cliente e defina os detalhes.</p></div><Badge variant="secondary">{{ isEditing ? 'Edição' : 'Rascunho' }}</Badge></header>
    <fieldset class="form-body" :disabled="saving || !hydrated"><legend class="visually-hidden">Dados do contrato</legend>
      <div v-if="!activeClients.length" class="form-notice" role="status"><UsersRound aria-hidden="true" /><div><p>Cadastre um cliente primeiro.</p><NuxtLink to="/clientes/novo">Criar um cliente</NuxtLink></div></div>
      <div class="campo"><Label for="contract-client">Cliente <span aria-hidden="true">*</span></Label><select id="contract-client" v-model="clientId" required :aria-invalid="!!fieldErrors.clientId" :aria-describedby="fieldErrors.clientId ? 'contract-client-error' : undefined"><option value="" disabled>Selecione um cliente</option><option v-for="client in activeClients" :key="client.id" :value="client.id">{{ client.name }} · {{ client.email || client.phone || client.id.slice(0, 8) }} · {{ client.id.slice(0, 8) }}</option></select><p v-if="fieldErrors.clientId" id="contract-client-error" class="field-error" role="alert">{{ fieldErrors.clientId }}</p></div>
      <div class="campo"><Label for="contract-title">Título <span aria-hidden="true">*</span></Label><Input id="contract-title" v-model="title" maxlength="160" placeholder="Ex.: Consultoria de marketing" required spellcheck="false" :aria-invalid="!!fieldErrors.title" :aria-describedby="fieldErrors.title ? 'contract-title-error' : undefined" /><p v-if="fieldErrors.title" id="contract-title-error" class="field-error" role="alert">{{ fieldErrors.title }}</p></div>
      <div class="form-row"><div class="campo"><Label for="contract-value">Valor (R$) <span aria-hidden="true">*</span></Label><Input id="contract-value" :model-value="money" type="tel" inputmode="decimal" placeholder="0,00" maxlength="15" required spellcheck="false" :aria-invalid="!!moneyError || !!fieldErrors.valueCents" :aria-describedby="moneyError || fieldErrors.valueCents ? 'contract-value-error' : undefined" @update:model-value="updateMoney" /><p v-if="moneyError || fieldErrors.valueCents" id="contract-value-error" class="field-error" role="alert">{{ moneyError || fieldErrors.valueCents }}</p></div><div class="campo"><Label for="contract-status">Status</Label><select id="contract-status" v-model="status"><option value="draft">Rascunho</option><option value="active">Ativo</option><option value="closed">Encerrado</option></select><p v-if="fieldErrors.status" class="field-error" role="alert">{{ fieldErrors.status }}</p></div></div>
      <div class="form-row"><div class="campo"><Label for="contract-start">Data de início <span aria-hidden="true">*</span></Label><Input id="contract-start" v-model="startDate" type="date" required :aria-invalid="!!fieldErrors.startDate" :aria-describedby="fieldErrors.startDate ? 'contract-start-error' : undefined" /><p v-if="fieldErrors.startDate" id="contract-start-error" class="field-error" role="alert">{{ fieldErrors.startDate }}</p></div><div class="campo"><Label for="contract-end">Data de término <span class="optional">Opcional</span></Label><Input id="contract-end" v-model="endDate" type="date" :aria-invalid="!!fieldErrors.endDate" :aria-describedby="fieldErrors.endDate ? 'contract-end-error' : undefined" /><p v-if="fieldErrors.endDate" id="contract-end-error" class="field-error" role="alert">{{ fieldErrors.endDate }}</p></div></div>
      <p class="form-help"><ShieldCheck aria-hidden="true" />O contrato será salvo somente após sua confirmação.</p>
    </fieldset>
    <footer class="form-footer"><Button type="button" variant="ghost" :disabled="saving" @click="discard">Descartar rascunho</Button><Button type="submit" :disabled="busy || saving || !activeClients.length"><ClipboardCheck aria-hidden="true" />{{ isEditing ? 'Revisar alterações' : 'Revisar contrato' }}</Button></footer>
  </form>
</template>

<script setup lang="ts">
import { ClipboardCheck, FilePlus2, ShieldCheck, UsersRound } from '@lucide/vue'
import type { ContractFields } from '#shared/types'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'

const { state, activeClients, hydrated, fieldErrors, saving, updateDraft, requestReview, discardDraft } = useWorkspace()
const { busy } = useAssistant()
const money = ref('')
const moneyError = ref('')
let editedCents: number | null = null
const isEditing = computed(() => !!state.value.draft?.recordId)
const fields = computed(() => state.value.draft?.entity === 'contract' ? state.value.draft.fields : {})
const clientId = computed({ get: () => fields.value.clientId || '', set: value => { updateDraft({ clientId: value }) } })
const title = computed({ get: () => fields.value.title || '', set: value => { updateDraft({ title: value }) } })
const status = computed({ get: () => fields.value.status || 'draft', set: (value: ContractFields['status']) => { updateDraft({ status: value }) } })
const startDate = computed({ get: () => fields.value.startDate || '', set: value => { updateDraft({ startDate: value }) } })
const endDate = computed({ get: () => fields.value.endDate || '', set: value => { updateDraft({ endDate: value }) } })

const updateMoney = (input: string | number) => {
  money.value = String(input)
  const valid = /^\d+(?:[,.]\d{0,2})?$/.test(money.value)
  moneyError.value = valid || !money.value ? '' : 'Use um valor com até duas casas decimais, sem separador de milhar.'
  if (!valid) {
    editedCents = 0
    updateDraft({ valueCents: 0 })
    return
  }
  const [whole = '0', fraction = ''] = money.value.replace(',', '.').split('.')
  editedCents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  updateDraft({ valueCents: editedCents })
}

const reviewContract = () => {
  if (moneyError.value) return
  requestReview()
}

const discard = async () => {
  if (!window.confirm('Descartar este rascunho de contrato?')) return
  if (discardDraft()) await navigateTo('/contratos')
}

watch(() => fields.value.valueCents, (value) => {
  if (value === editedCents) return
  money.value = value === undefined ? '' : (value / 100).toFixed(2).replace('.', ',')
  moneyError.value = ''
}, { immediate: true })
</script>
