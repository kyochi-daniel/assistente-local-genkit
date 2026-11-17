<template>
  <section>
    <header class="page-header"><div><p class="eyebrow">SEUS DADOS CONTINUAM AQUI</p><h1>Lixeira <span class="heading-count">{{ deletedClients.length + deletedContracts.length }}</span></h1><p>Restaure clientes e contratos quando precisar.</p></div></header>
    <p class="form-notice trash-note">Mover para a lixeira preserva os dados neste navegador. Restaurar um cliente também restaura os contratos movidos junto com ele. Registros na lixeira continuam contando no limite de 200 por tipo.</p>
    <p v-if="!hydrated" class="loading-state" role="status">Carregando lixeira…</p>
    <div v-else-if="!deletedClients.length && !deletedContracts.length" class="list-card empty-state"><span class="empty-icon"><Trash2 aria-hidden="true" /></span><h2>A lixeira está vazia.</h2><p>Clientes e contratos movidos para cá poderão ser restaurados.</p></div>
    <template v-else>
      <div class="list-card">
        <header class="list-header"><h2>Clientes na lixeira</h2><span>{{ deletedClients.length }} {{ deletedClients.length === 1 ? 'cliente' : 'clientes' }}</span></header>
        <p v-if="!deletedClients.length" class="loading-state">Nenhum cliente na lixeira.</p>
        <div v-else class="table-scroll"><table><caption class="visually-hidden">Clientes que podem ser restaurados</caption><thead><tr><th scope="col">Cliente</th><th scope="col">Contato</th><th scope="col">Movido para a lixeira</th><th scope="col">Ações</th></tr></thead><tbody><tr v-for="client in deletedClients" :key="client.id"><td><span class="record-name">{{ client.name }}</span><small class="record-id">{{ client.id.slice(0, 8) }}</small></td><td>{{ client.email || client.phone || 'Não informado' }}</td><td>{{ deletedDate(client.deletedAt) }}</td><td><Button variant="outline" size="sm" :disabled="busy || saving" :aria-label="`Restaurar cliente ${client.name}`" @click="requestRestore('client', client.id)"><RotateCcw aria-hidden="true" />Restaurar</Button></td></tr></tbody></table></div>
      </div>
      <div class="list-card">
        <header class="list-header"><h2>Contratos na lixeira</h2><span>{{ deletedContracts.length }} {{ deletedContracts.length === 1 ? 'contrato' : 'contratos' }}</span></header>
        <p v-if="!deletedContracts.length" class="loading-state">Nenhum contrato na lixeira.</p>
        <div v-else class="table-scroll"><table><caption class="visually-hidden">Contratos na lixeira e condições de restauração</caption><thead><tr><th scope="col">Contrato</th><th scope="col">Cliente</th><th scope="col">Movido para a lixeira</th><th scope="col">Ações</th></tr></thead><tbody><tr v-for="contract in deletedContracts" :key="contract.id"><td><span class="record-name">{{ contract.title }}</span><small class="record-id">{{ contract.id.slice(0, 8) }}</small></td><td>{{ state.clients.find(client => client.id === contract.clientId)?.name || 'Cliente indisponível' }}<small class="record-id">{{ contract.clientId.slice(0, 8) }}</small></td><td>{{ deletedDate(contract.deletedAt) }}</td><td><Button variant="outline" size="sm" :disabled="busy || saving || !canRestoreContract(contract.clientId)" :aria-label="`Restaurar contrato ${contract.title}`" :aria-describedby="!canRestoreContract(contract.clientId) ? `restore-${contract.id}` : undefined" @click="requestRestore('contract', contract.id)"><RotateCcw aria-hidden="true" />Restaurar</Button><p v-if="!canRestoreContract(contract.clientId)" :id="`restore-${contract.id}`" class="small muted">Restaure o cliente primeiro.</p></td></tr></tbody></table></div>
      </div>
    </template>
    <p class="list-note"><LockKeyhole aria-hidden="true" />A restauração exige sua confirmação. Nenhum dado é removido definitivamente.</p>
  </section>
</template>

<script setup lang="ts">
import { LockKeyhole, RotateCcw, Trash2 } from '@lucide/vue'
import { Button } from '~/components/ui/button'

const { state, hydrated, activeClients, deletedClients, deletedContracts, saving, requestRestore } = useWorkspace()
const { busy } = useAssistant()
definePageMeta({ middleware: 'auth' })
const canRestoreContract = (clientId: string) => activeClients.value.some(client => client.id === clientId)
const deletedDate = (value?: string) => value ? new Date(value).toLocaleDateString('pt-BR') : 'Não informada'
</script>
