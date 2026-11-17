<template>
  <form class="record-form" novalidate @submit.prevent="requestReview">
    <header class="form-header"><span class="form-icon"><UserRoundPlus aria-hidden="true" /></span><div><h2>Dados do cliente</h2><p>Preencha os dados ou peça ajuda ao assistente.</p></div><Badge variant="secondary">{{ isEditing ? 'Edição' : 'Rascunho' }}</Badge></header>
    <fieldset class="form-body" :disabled="saving || !hydrated"><legend class="visually-hidden">Dados do cliente</legend>
      <div class="campo"><Label for="client-name">Nome <span aria-hidden="true">*</span></Label><Input id="client-name" v-model="name" placeholder="Ex.: Ana Souza" maxlength="120" autocomplete="name" spellcheck="false" required :aria-invalid="!!fieldErrors.name" :aria-describedby="fieldErrors.name ? 'client-name-error' : undefined" /><p v-if="fieldErrors.name" id="client-name-error" class="field-error" role="alert">{{ fieldErrors.name }}</p></div>
      <div class="campo"><Label for="client-email">E-mail <span class="optional">Opcional</span></Label><Input id="client-email" v-model="email" type="email" placeholder="ana@exemplo.com" maxlength="254" autocomplete="email" spellcheck="false" :aria-invalid="!!fieldErrors.email" :aria-describedby="fieldErrors.email ? 'client-email-error' : undefined" /><p v-if="fieldErrors.email" id="client-email-error" class="field-error" role="alert">{{ fieldErrors.email }}</p></div>
      <div class="campo"><Label for="client-phone">Telefone <span class="optional">Opcional</span></Label><Input id="client-phone" v-model="phone" type="tel" placeholder="(00) 00000-0000" maxlength="30" autocomplete="tel" spellcheck="false" :aria-invalid="!!fieldErrors.phone" :aria-describedby="fieldErrors.phone ? 'client-phone-error' : undefined" /><p v-if="fieldErrors.phone" id="client-phone-error" class="field-error" role="alert">{{ fieldErrors.phone }}</p></div>
      <p class="form-help"><ShieldCheck aria-hidden="true" />Você revisa todos os dados antes de salvar.</p>
    </fieldset>
    <footer class="form-footer"><Button type="button" variant="ghost" :disabled="saving" @click="discard">Descartar rascunho</Button><Button type="submit" :disabled="busy || saving"><ClipboardCheck aria-hidden="true" />{{ isEditing ? 'Revisar alterações' : 'Revisar cadastro' }}</Button></footer>
  </form>
</template>

<script setup lang="ts">
import { ClipboardCheck, ShieldCheck, UserRoundPlus } from '@lucide/vue'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'

const { state, hydrated, fieldErrors, saving, updateDraft, requestReview, discardDraft } = useWorkspace()
const { busy } = useAssistant()
const isEditing = computed(() => !!state.value.draft?.recordId)
const fields = computed(() => state.value.draft?.entity === 'client' ? state.value.draft.fields : {})
const name = computed({ get: () => fields.value.name || '', set: value => { updateDraft({ name: value }) } })
const email = computed({ get: () => fields.value.email || '', set: value => { updateDraft({ email: value }) } })
const phone = computed({ get: () => fields.value.phone || '', set: value => { updateDraft({ phone: value }) } })

const discard = async () => {
  if (!window.confirm('Descartar este rascunho de cliente?')) return
  if (discardDraft()) await navigateTo('/clientes')
}
</script>
