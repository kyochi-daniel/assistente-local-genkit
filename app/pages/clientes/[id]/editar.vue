<template>
  <section>
    <header class="page-header"><div><NuxtLink to="/clientes" class="back-link"><ArrowLeft aria-hidden="true" />Clientes</NuxtLink><h1>Editar cliente</h1><p>Revise as alterações antes de atualizar o cadastro.</p></div></header>
    <ClientForm v-if="hydrated && state.draft?.entity === 'client' && state.draft.recordId === route.params.id" />
    <p v-else role="status" class="loading-state">Preparando a edição…</p>
  </section>
</template>

<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
const route = useRoute()
const { state, hydrated, openEdit } = useWorkspace()
definePageMeta({ middleware: 'auth', key: route => route.fullPath })
onMounted(async () => { if (!await openEdit('client', String(route.params.id))) await navigateTo('/clientes') })
</script>
