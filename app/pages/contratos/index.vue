<template>
  <section>
    <header class="page-header"><div><p class="eyebrow">CADA ACORDO, NO SEU LUGAR</p><h1>Contratos <span class="heading-count">{{ activeContracts.length }}</span></h1><p>Uma visão clara dos seus próximos passos.</p></div><Button as-child><NuxtLink to="/contratos/novo"><Plus aria-hidden="true" />Novo contrato</NuxtLink></Button></header>
    <div class="list-card">
      <header class="list-header"><h2>Contratos ativos</h2><span>{{ state.contracts.length }} de 200 cadastros, incluindo a lixeira</span></header>
      <p v-if="!hydrated" class="loading-state" role="status">Carregando contratos…</p>
      <div v-else-if="!activeContracts.length" class="empty-state"><span class="empty-icon"><Files aria-hidden="true" /></span><h2>Espaço para o próximo projeto.</h2><p>Crie um contrato vinculado a um cliente e mantenha os detalhes organizados.</p><Button as-child variant="outline"><NuxtLink to="/contratos/novo"><Plus aria-hidden="true" />Criar primeiro contrato</NuxtLink></Button></div>
      <div v-else class="table-scroll"><table><caption class="visually-hidden">Contratos salvos neste navegador</caption><thead><tr><th scope="col">Contrato</th><th scope="col">Cliente</th><th scope="col">Valor</th><th scope="col">Início / Término</th><th scope="col">Status</th><th scope="col">Ações</th></tr></thead><tbody><tr v-for="contract in activeContracts" :key="contract.id"><td><span class="record-name">{{ contract.title }}</span><small class="record-id">{{ contract.id.slice(0, 8) }}</small></td><td>{{ state.clients.find(client => client.id === contract.clientId)?.name || 'Cliente indisponível' }}<small class="record-id">{{ contract.clientId.slice(0, 8) }}</small></td><td>{{ currency(contract.valueCents) }}</td><td>{{ date(contract.startDate) }}<small class="record-id">{{ contract.endDate ? date(contract.endDate) : 'Sem término' }}</small></td><td><Badge variant="secondary" :class="contract.status">{{ statusNames[contract.status] }}</Badge></td><td><div class="record-actions"><Button as-child variant="outline" size="sm" :disabled="busy || saving"><NuxtLink :to="`/contratos/${contract.id}/editar`" :aria-label="`Editar contrato ${contract.title}`">Editar</NuxtLink></Button><Button variant="ghost" size="sm" :disabled="busy || saving" :aria-label="`Mover contrato ${contract.title} para a lixeira`" @click="requestDelete('contract', contract.id)">Mover para a lixeira</Button></div></td></tr></tbody></table></div>
    </div>
    <p class="list-note"><LockKeyhole aria-hidden="true" />Registros locais para demonstração. Sem assinatura ou emissão de documentos.</p>
  </section>
</template>

<script setup lang="ts">
import { Files, LockKeyhole, Plus } from '@lucide/vue'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
const { state, hydrated, activeContracts, saving, requestDelete } = useWorkspace()
const { busy } = useAssistant()
definePageMeta({ middleware: 'auth' })
const statusNames = { draft: 'Rascunho', active: 'Ativo', closed: 'Encerrado' }
const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100)
const date = (value: string) => value.split('-').reverse().join('/')
</script>
