<template>
  <section>
    <header class="page-header"><div><NuxtLink to="/clientes" class="back-link"><ArrowLeft aria-hidden="true" />Clientes</NuxtLink><h1>Novo cliente</h1><p>Um novo contato, o começo de uma boa relação.</p></div></header>
    <ClientForm v-if="hydrated && state.draft?.entity === 'client'" />
    <p v-else role="status" class="loading-state">Preparando seu rascunho…</p>
  </section>
</template>

<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
const { state, hydrated, openDraft } = useWorkspace()
definePageMeta({ middleware: 'auth' })
onMounted(async () => { if (!await openDraft('client')) await navigateTo('/clientes') })
</script>
