<template>
  <section>
    <header class="page-header"><div><NuxtLink to="/contratos" class="back-link"><ArrowLeft aria-hidden="true" />Contratos</NuxtLink><h1>Novo contrato</h1><p>Transforme o próximo projeto em um acordo organizado.</p></div></header>
    <ContractForm v-if="hydrated && state.draft?.entity === 'contract'" />
    <p v-else role="status" class="loading-state">Preparando seu rascunho…</p>
  </section>
</template>

<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
const { state, hydrated, openDraft } = useWorkspace()
definePageMeta({ middleware: 'auth' })
onMounted(async () => { if (!await openDraft('contract')) await navigateTo('/contratos') })
</script>
