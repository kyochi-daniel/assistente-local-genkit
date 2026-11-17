<template>
  <section>
    <header class="page-header"><div><p class="eyebrow">RELACIONAMENTOS EM ORDEM</p><h1>Clientes <span class="heading-count">{{ activeClients.length }}</span></h1><p>Seus contatos, sempre por perto.</p></div><Button as-child><NuxtLink to="/clientes/novo"><Plus aria-hidden="true" />Novo cliente</NuxtLink></Button></header>
    <div class="list-card">
      <header class="list-header"><h2>Clientes ativos</h2><span>{{ state.clients.length }} de 200 cadastros, incluindo a lixeira</span></header>
      <p v-if="!hydrated" class="loading-state" role="status">Carregando clientes…</p>
      <div v-else-if="!activeClients.length" class="empty-state"><span class="empty-icon"><UsersRound aria-hidden="true" /></span><h2>Sua próxima conexão começa aqui.</h2><p>Cadastre seu primeiro cliente ou peça ao assistente para ajudar.</p><Button as-child variant="outline"><NuxtLink to="/clientes/novo"><Plus aria-hidden="true" />Cadastrar primeiro cliente</NuxtLink></Button></div>
      <div v-else class="table-scroll"><table><caption class="visually-hidden">Clientes salvos neste navegador</caption><thead><tr><th scope="col">Cliente</th><th scope="col">E-mail</th><th scope="col">Telefone</th><th scope="col">Cadastro</th><th scope="col">Ações</th></tr></thead><tbody><tr v-for="client in activeClients" :key="client.id"><td><span class="record-name">{{ client.name }}</span><small class="record-id">{{ client.id.slice(0, 8) }}</small></td><td>{{ client.email || 'Não informado' }}</td><td>{{ client.phone || 'Não informado' }}</td><td>{{ new Date(client.createdAt).toLocaleDateString('pt-BR') }}</td><td><div class="record-actions"><Button as-child variant="outline" size="sm" :disabled="busy || saving"><NuxtLink :to="`/clientes/${client.id}/editar`" :aria-label="`Editar cliente ${client.name}`">Editar</NuxtLink></Button><Button variant="ghost" size="sm" :disabled="busy || saving" :aria-label="`Mover cliente ${client.name} para a lixeira`" @click="requestDelete('client', client.id)">Mover para a lixeira</Button></div></td></tr></tbody></table></div>
    </div>
    <p class="list-note"><LockKeyhole aria-hidden="true" />Seus cadastros ficam apenas neste navegador. Use dados fictícios.</p>
  </section>
</template>

<script setup lang="ts">
import { LockKeyhole, Plus, UsersRound } from '@lucide/vue'
import { Button } from '~/components/ui/button'
const { state, hydrated, activeClients, saving, requestDelete } = useWorkspace()
const { busy } = useAssistant()
definePageMeta({ middleware: 'auth' })
</script>
