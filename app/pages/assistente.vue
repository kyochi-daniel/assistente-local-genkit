<template>
  <header class="page-header assistant-page-header">
    <div><p class="eyebrow">SEU DIA, MAIS SIMPLES</p><h1>Vamos fazer acontecer.</h1><p>Converse para organizar seus clientes e contratos. Você tem o controle de cada etapa.</p></div>
    <Badge variant="outline"><span class="status-dot" />Assistente de trabalho</Badge>
  </header>
</template>

<script setup lang="ts">
import { Badge } from '~/components/ui/badge'
definePageMeta({ middleware: 'auth' })
</script>
