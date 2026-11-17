<template>
  <section>
    <header class="page-header"><div><NuxtLink to="/contratos" class="back-link"><ArrowLeft aria-hidden="true" />Contratos</NuxtLink><h1>Editar contrato</h1><p>Revise as alterações antes de atualizar o cadastro.</p></div></header>
    <ContractForm v-if="hydrated && state.draft?.entity === 'contract' && state.draft.recordId === route.params.id" />
    <p v-else role="status" class="loading-state">Preparando a edição…</p>
  </section>
</template>

<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
const route = useRoute()
const { state, hydrated, openEdit } = useWorkspace()
definePageMeta({ middleware: 'auth', key: route => route.fullPath })
onMounted(async () => { if (!await openEdit('contract', String(route.params.id))) await navigateTo('/contratos') })
</script>
